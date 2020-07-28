/*
 * Copyright 2020
 * SRFG - Salzburg Research Forschungsgesellschaft mbH; Salzburg; Austria
   In collaboration with
 * SRDC - Software Research & Development Consultancy; Ankara; Turkey
   Licensed under the Apache License, Version 2.0 (the "License");
   you may not use this file except in compliance with the License.
   You may obtain a copy of the License at
       http://www.apache.org/licenses/LICENSE-2.0
   Unless required by applicable law or agreed to in writing, software
   distributed under the License is distributed on an "AS IS" BASIS,
   WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
   See the License for the specific language governing permissions and
   limitations under the License.
 */

import { Price } from "../catalogue/model/publish/price";
import { Quantity } from "../catalogue/model/publish/quantity";
import { copy, currencyToString, roundToTwoDecimals, roundToTwoDecimalsNumber } from "./utils";
import { ItemPriceWrapper } from "./item-price-wrapper";
import { PriceOption } from '../catalogue/model/publish/price-option';
import { PRICE_OPTIONS } from '../catalogue/model/constants';
import { ItemProperty } from '../catalogue/model/publish/item-property';
import { Address } from '../catalogue/model/publish/address';
import { Text } from '../catalogue/model/publish/text';
import { Country } from '../catalogue/model/publish/country';

/**
 * Wrapper around a price and a quantity, contains convenience methods to get the total price,
 * price per item and their string representations.
 *
 * This class can also be substituted for a Quantity.
 */
export class DiscountPriceWrapper {
    itemPrice: ItemPriceWrapper;
    immutableOriginalCatalogueLinePrice: Price;
    // this field is used to create discount-modal view
    appliedDiscounts: PriceOption[] = [];

    constructor(public originalCatalogueLinePrice: Price, // immutable initial price that to be used as the starting price while calculating the discount
        public price: Price, // dynamically changing price upon the updates on the price
        public vatPercentage: number,
        public orderedQuantity: Quantity = new Quantity(1, price.baseQuantity.unitCode), // ordered quantity
        public priceOptions: PriceOption[] = [],
        public additionalItemProperties: ItemProperty[] = [],
        public incoterm: string = null,
        public paymentMeans: string = null,
        public deliveryPeriod: Quantity = null,
        public deliveryLocation: Address = null,
        public hiddenPrice:boolean = false
    ) {
        this.immutableOriginalCatalogueLinePrice = copy(originalCatalogueLinePrice);
        this.itemPrice = new ItemPriceWrapper(price, hiddenPrice);
        this.getDiscountedTotalPrice(); // to initialize the applied discounts list
    }

    get originalPricePerItem(): number {
        if (!this.itemPrice.hasPrice() || !this.isOrderedQuantityValid()) {
            return 0;
        }

        const baseQuantity = this.immutableOriginalCatalogueLinePrice.baseQuantity.value || 1;
        return this.immutableOriginalCatalogueLinePrice.priceAmount.value / baseQuantity;
    }

    get pricePerItem(): number {
        if (!this.itemPrice.hasPrice() || !this.isOrderedQuantityValid()) {
            return 0;
        }

        return roundToTwoDecimalsNumber(this.itemPrice.pricePerItem);
    }

    get pricePerItemString(): string {
        const qty = this.orderedQuantity;

        if (!this.itemPrice.hasPrice() || !this.isOrderedQuantityValid()) {
            return "On demand";
        }

        return `${roundToTwoDecimals(this.pricePerItem)} ${currencyToString(this.price.priceAmount.currencyID)} per ${qty.unitCode}`;
    }

    get discountedPricePerItem(): number {
        if (!this.itemPrice.hasPrice() || !this.isOrderedQuantityValid()) {
            return 0;
        }

        let discountedTotalPrice: number = this.getDiscountedTotalPrice();
        return roundToTwoDecimalsNumber(discountedTotalPrice / this.orderedQuantity.value);
    }

    get discountedPricePerItemString(): string {
        const qty = this.orderedQuantity;
        if (!this.itemPrice.hasPrice() || !this.isOrderedQuantityValid()) {
            return "On demand";
        }

        return `${roundToTwoDecimals(this.discountedPricePerItem)} ${currencyToString(this.price.priceAmount.currencyID)} per ${qty.unitCode}`;
    }

    get totalPrice(): number {
        if (!this.itemPrice.hasPrice() || !this.isOrderedQuantityValid()) {
            return 0;
        }

        return this.orderedQuantity.value * this.itemPrice.value;
    }

    set totalPrice(price: number) {
        const quantity = this.orderedQuantity.value || 1;
        this.price.priceAmount.value = price / quantity * this.itemPrice.baseQuantity
    }

    get totalPriceString(): string {
        if (!this.itemPrice.hasPrice()) {
            return "On demand";
        }
        return `${roundToTwoDecimals(this.totalPrice)} ${this.currency}`;
    }

    get vatTotal(): number {
        return this.totalPrice * this.vatPercentage / 100;
    }

    get vatTotalString(): string {
        return `${roundToTwoDecimals(this.vatTotal)} ${this.currency}`;
    }

    get grossTotal(): number {
        return this.totalPrice + this.vatTotal;
    }

    get grossTotalString(): string {
        let grossTotal = this.grossTotal;
        if (grossTotal == 0) {
            return "On demand";
        }
        return `${roundToTwoDecimals(grossTotal)} ${this.currency}`;
    }

    get currency(): string {
        return currencyToString(this.price.priceAmount.currencyID);
    }

    set currency(currency: string) {
        this.price.priceAmount.currencyID = currency;
    }

    isDiscountApplied(): boolean {
        return this.appliedDiscounts.length > 0;
    }

    /**
     *  Price options functions
     */
    private getDiscountedTotalPrice(): number {
        // use the initial price if the discounts are calculated, otherwise use the current price value
        // this is required as the price value is update in this method
        //const pricePerItem = this.useCatalogueLinePrice ? this.initialCatalogueLinePrice : this.itemPrice.value;
        let totalPrice = this.orderedQuantity.value * this.originalPricePerItem;

        let totalDiscount: number = 0;
        // for Minimum Order Quantity and Delivery Period price options, we find the ones offering the maximum discounts
        let maximumMinimumOrderQuantityDiscount = 0;
        let minimumOrderQuantityPriceOptionForDiscount: PriceOption = null;
        let maximumDeliveryPeriodDiscount = 0;
        let deliveryPeriodPriceOptionForDiscount: PriceOption = null;
        // for Minimum Order Quantity and Delivery Period price options, we find the ones offering the maximum charges
        // (the most negative one since charges are represented by negative values)
        let minimumMinimumOrderQuantityCharge = 0;
        let minimumOrderQuantityPriceOptionForCharge: PriceOption = null;
        let minimumDeliveryPeriodCharge = 0;
        let deliveryPeriodPriceOptionForCharge: PriceOption = null;
        // there might be multiple price options for delivery location
        // in this case, we need to apply the one which satisfies the most address fields
        let numberOfAddressFieldsSatisfiedByPriceOptionForDeliveryLocation = 0;
        // price option to be applied for delivery location
        let priceOptionForDeliveryLocation = null;

        // reset appliedDiscounts
        this.appliedDiscounts = [];

        // check for price options
        for (let priceOption of this.priceOptions) {
            // check for incoterms
            if (this.incoterm && priceOption.typeID == PRICE_OPTIONS.INCOTERM.typeID && priceOption.incoterms.indexOf(this.incoterm) != -1) {
                priceOption.discount = this.calculateDiscountAmount(priceOption, totalPrice);
                totalDiscount += priceOption.discount;
                // add this discount to appliedDiscounts list

                this.appliedDiscounts.push(priceOption);
            }
            // check for paymentMeans
            else if (this.paymentMeans && priceOption.typeID == PRICE_OPTIONS.PAYMENT_MEAN.typeID && priceOption.paymentMeans[0].paymentMeansCode.value == this.paymentMeans) {
                priceOption.discount = this.calculateDiscountAmount(priceOption, totalPrice);
                totalDiscount += priceOption.discount;
                // add this discount to appliedDiscounts list
                this.appliedDiscounts.push(priceOption);
            }
            // check for minimum order quantity
            else if (priceOption.typeID == PRICE_OPTIONS.ORDERED_QUANTITY.typeID && priceOption.itemLocationQuantity.minimumQuantity.unitCode == this.orderedQuantity.unitCode
                && this.orderedQuantity.value >= priceOption.itemLocationQuantity.minimumQuantity.value) {
                let qDiscount = this.calculateDiscountAmount(priceOption, totalPrice);
                // discount
                if (qDiscount > 0 && qDiscount > maximumMinimumOrderQuantityDiscount) {
                    maximumMinimumOrderQuantityDiscount = qDiscount;
                    minimumOrderQuantityPriceOptionForDiscount = priceOption;
                }
                // charge
                else if (qDiscount < minimumMinimumOrderQuantityCharge) {
                    minimumMinimumOrderQuantityCharge = qDiscount;
                    minimumOrderQuantityPriceOptionForCharge = priceOption;
                }
            }
            // check for delivery period
            else if (this.deliveryPeriod && priceOption.typeID == PRICE_OPTIONS.DELIVERY_PERIOD.typeID &&
                priceOption.estimatedDeliveryPeriod.durationMeasure.unitCode == this.deliveryPeriod.unitCode &&
                priceOption.estimatedDeliveryPeriod.durationMeasure.value <= this.deliveryPeriod.value) {

                let dpDiscount = this.calculateDiscountAmount(priceOption, totalPrice);
                // discount
                if (dpDiscount > 0 && dpDiscount > maximumDeliveryPeriodDiscount) {
                    maximumDeliveryPeriodDiscount = dpDiscount;
                    deliveryPeriodPriceOptionForDiscount = priceOption;
                }
                // charge
                else if (dpDiscount < minimumDeliveryPeriodCharge) {
                    minimumDeliveryPeriodCharge = dpDiscount;
                    deliveryPeriodPriceOptionForCharge = priceOption;
                }
            }
            // check for additional item properties
            else if (this.additionalItemProperties.length > 0 && priceOption.typeID == PRICE_OPTIONS.PRODUCT_PROPERTY.typeID) {
                for (let property of this.additionalItemProperties) {
                    // check if a property is already selected for this discount option
                    if (priceOption.additionalItemProperty.length == 0) {
                        continue;
                    }
                    if (property.id == priceOption.additionalItemProperty[0].id && this.existenceOfPriceOptionForPropertyValue(priceOption.additionalItemProperty[0].value, property.value[0])) {
                        priceOption.discount = this.calculateDiscountAmount(priceOption, totalPrice);
                        totalDiscount += priceOption.discount;
                        // add this discount to appliedDiscounts list
                        this.appliedDiscounts.push(priceOption);
                    }
                }
            }
            else if (priceOption.typeID == PRICE_OPTIONS.DELIVERY_LOCATION.typeID && this.deliveryLocation) {
                // check whether addresses are the same or not
                let checkStreetName = priceOption.itemLocationQuantity.applicableTerritoryAddress[0].streetName != "";
                let checkBuildingNumber = priceOption.itemLocationQuantity.applicableTerritoryAddress[0].buildingNumber != "";
                let checkPostalZone = priceOption.itemLocationQuantity.applicableTerritoryAddress[0].postalZone != "";
                let checkCityName = priceOption.itemLocationQuantity.applicableTerritoryAddress[0].cityName != "";
                let checkRegion = priceOption.itemLocationQuantity.applicableTerritoryAddress[0].region != "";
                let country: Country = priceOption.itemLocationQuantity.applicableTerritoryAddress[0].country;
                let checkCountryName = country && country.name.value && country.name.value != "";

                // if the address is not specified for this price option, skip it
                if(checkStreetName || checkBuildingNumber || checkPostalZone || checkCityName || checkRegion || checkCountryName){
                    if (checkStreetName && priceOption.itemLocationQuantity.applicableTerritoryAddress[0].streetName.toLocaleLowerCase() != this.deliveryLocation.streetName.toLocaleLowerCase()) {
                        continue;
                    }
                    if (checkBuildingNumber && priceOption.itemLocationQuantity.applicableTerritoryAddress[0].buildingNumber != this.deliveryLocation.buildingNumber) {
                        continue;
                    }
                    if (checkPostalZone && priceOption.itemLocationQuantity.applicableTerritoryAddress[0].postalZone != this.deliveryLocation.postalZone) {
                        continue;
                    }
                    if (checkCityName && priceOption.itemLocationQuantity.applicableTerritoryAddress[0].cityName.toLocaleLowerCase() != this.deliveryLocation.cityName.toLocaleLowerCase()) {
                        continue;
                    }
                    if (checkRegion && priceOption.itemLocationQuantity.applicableTerritoryAddress[0].region.toLocaleLowerCase() != this.deliveryLocation.region.toLocaleLowerCase()) {
                        continue;
                    }
                    if (checkCountryName && (this.deliveryLocation.country.name.value == null || (priceOption.itemLocationQuantity.applicableTerritoryAddress[0].country.name.value.toLocaleLowerCase() != this.deliveryLocation.country.name.value.toLocaleLowerCase()))) {
                        continue;
                    }
                    // the delivery location satisfies all conditions
                    // check the number of address fields available in this price option
                    let numberOfAddressFieldsInPriceOption = [checkStreetName,checkBuildingNumber,checkPostalZone,checkCityName,checkRegion,checkCountryName].filter(value => value).length;
                    // this price option has more address field,so we need to use it for delivery location
                    if(numberOfAddressFieldsInPriceOption > numberOfAddressFieldsSatisfiedByPriceOptionForDeliveryLocation){
                        numberOfAddressFieldsSatisfiedByPriceOptionForDeliveryLocation = numberOfAddressFieldsInPriceOption;
                        priceOptionForDeliveryLocation = priceOption;
                    }
                }
            }
        }

        // add the individual discounts
        totalDiscount += maximumMinimumOrderQuantityDiscount;
        totalDiscount += maximumDeliveryPeriodDiscount;
        totalDiscount += minimumMinimumOrderQuantityCharge;
        totalDiscount += minimumDeliveryPeriodCharge;

        if (minimumOrderQuantityPriceOptionForDiscount != null) {
            minimumOrderQuantityPriceOptionForDiscount.discount = maximumMinimumOrderQuantityDiscount;
            this.appliedDiscounts.push(minimumOrderQuantityPriceOptionForDiscount);
        }
        if (deliveryPeriodPriceOptionForDiscount != null) {
            deliveryPeriodPriceOptionForDiscount.discount = maximumDeliveryPeriodDiscount;
            this.appliedDiscounts.push(deliveryPeriodPriceOptionForDiscount);
        }
        if (minimumOrderQuantityPriceOptionForCharge != null) {
            minimumOrderQuantityPriceOptionForCharge.discount = minimumMinimumOrderQuantityCharge;
            this.appliedDiscounts.push(minimumOrderQuantityPriceOptionForCharge);
        }
        if (deliveryPeriodPriceOptionForCharge != null) {
            deliveryPeriodPriceOptionForCharge.discount = minimumDeliveryPeriodCharge;
            this.appliedDiscounts.push(deliveryPeriodPriceOptionForCharge);
        }
        if(priceOptionForDeliveryLocation){
            priceOptionForDeliveryLocation.discount = this.calculateDiscountAmount(priceOptionForDeliveryLocation, totalPrice);
            totalDiscount += priceOptionForDeliveryLocation.discount;
            // add this discount to appliedDiscounts list
            this.appliedDiscounts.push(priceOptionForDeliveryLocation)
        }

        return totalPrice - totalDiscount;
    }

    private calculateDiscountAmount(priceOption: PriceOption, totalPrice: number): number {
        let discount = 0;

        // total price
        if (priceOption.itemLocationQuantity.allowanceCharge[0].amount && priceOption.itemLocationQuantity.allowanceCharge[0].amount.value) {
            // unit is %
            if (priceOption.itemLocationQuantity.allowanceCharge[0].amount.currencyID == "%") {
                discount += totalPrice * priceOption.itemLocationQuantity.allowanceCharge[0].amount.value / 100.0;
            }
            // unit is not %
            else {
                discount += priceOption.itemLocationQuantity.allowanceCharge[0].amount.value;
            }
        }
        // per unit
        else if (priceOption.itemLocationQuantity.allowanceCharge[0].perUnitAmount.value) {
            discount += priceOption.itemLocationQuantity.allowanceCharge[0].perUnitAmount.value * this.orderedQuantity.value;
        }

        return discount;
    }

    public calculateTotalDiscount(): number {
        let totalDiscount = 0;
        for (let discount of this.appliedDiscounts) {
            totalDiscount += discount.discount;
        }
        return totalDiscount;
    }

    // checks whether there's a price option for the selected property value or not
    private existenceOfPriceOptionForPropertyValue(priceOptionPropertyValues: Text[], selectedPropertyValue: Text): boolean {
        for (let property of priceOptionPropertyValues) {
            if (property.value == selectedPropertyValue.value && property.languageID == selectedPropertyValue.languageID) {
                return true;
            }
        }
        return false;
    }

    private isOrderedQuantityValid(): boolean {
        return !isNaN(this.orderedQuantity.value) && !!this.orderedQuantity.value;
    }
}
