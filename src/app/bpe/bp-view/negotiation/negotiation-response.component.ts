import {Component, Input, OnInit, ViewChild} from '@angular/core';
import { Location } from "@angular/common";
import { CatalogueLine } from "../../../catalogue/model/publish/catalogue-line";
import { RequestForQuotation } from "../../../catalogue/model/publish/request-for-quotation";
import { BPDataService } from "../bp-data-service";
import { BPEService } from "../../bpe.service";
import { Router } from "@angular/router";
import { Quotation } from "../../../catalogue/model/publish/quotation";
import { NegotiationModelWrapper } from "./negotiation-model-wrapper";
import { NEGOTIATION_RESPONSES, CURRENCIES } from "../../../catalogue/model/constants";
import { ModelUtils } from "../../model/model-utils";
import { ProcessVariables } from "../../model/process-variables";
import { ProcessInstanceInputMessage } from "../../model/process-instance-input-message";
import { CallStatus } from "../../../common/call-status";
import { Quantity } from "../../../catalogue/model/publish/quantity";
import { BpUserRole } from "../../model/bp-user-role";
import {CookieService} from 'ng2-cookies';
import {DiscountModalComponent} from '../../../product-details/discount-modal.component';
import {BpActivityEvent} from '../../../catalogue/model/publish/bp-start-event';
import {ThreadEventMetadata} from '../../../catalogue/model/publish/thread-event-metadata';
import {UBLModelUtils} from '../../../catalogue/model/ubl-model-utils';
import * as myGlobals from '../../../globals';
import {copy, isValidPrice} from "../../../common/utils";
import {DigitalAgreement} from "../../../catalogue/model/publish/digital-agreement";
import * as moment from "moment";
import {Moment, unitOfTime} from "moment";
import {Period} from "../../../catalogue/model/publish/period";
import {DocumentReference} from "../../../catalogue/model/publish/document-reference";
import {Party} from "../../../catalogue/model/publish/party";
import {NegotiationOptions} from "../../../catalogue/model/publish/negotiation-options";

@Component({
    selector: "negotiation-response",
    templateUrl: "./negotiation-response.component.html",
    styleUrls: ["./negotiation-response.component.css"],
})
export class NegotiationResponseComponent implements OnInit {

    dateFormat = "YYYY-MM-DD";

    line: CatalogueLine;
    @Input() rfq: RequestForQuotation;
    @Input() quotation: Quotation;
    wrapper: NegotiationModelWrapper;
    userRole: BpUserRole;
    @Input() readonly: boolean = false;
    config = myGlobals.config;

    CURRENCIES: string[] = CURRENCIES;

    callStatus: CallStatus = new CallStatus();

    // the copy of ThreadEventMetadata of the current business process
    processMetadata: ThreadEventMetadata;

    @ViewChild(DiscountModalComponent)
    private discountModal: DiscountModalComponent;

    getPartyId = UBLModelUtils.getPartyId;
    frameContract: DigitalAgreement;
    showFrameContractDetails: boolean = false;
    showNotesAndAdditionalFiles: boolean = false;
    showDeliveryAddress: boolean = false;
    showTermsAndConditions:boolean = false;
    showPurchaseOrder:boolean = false;

    constructor(private bpeService: BPEService,
                private bpDataService: BPDataService,
                private location: Location,
                private cookieService: CookieService,
                private router: Router) {

    }

    ngOnInit() {
        // get copy of ThreadEventMetadata of the current business process
        if(!this.bpDataService.bpActivityEvent.newProcess) {
            this.processMetadata = this.bpDataService.bpActivityEvent.processHistory[0];
        }

        this.line = this.bpDataService.getCatalogueLine();
        if(this.rfq == null) {
            this.rfq = this.bpDataService.requestForQuotation;
        }
        if(this.quotation == null) {
            this.quotation = this.bpDataService.quotation;
        }
        this.wrapper = new NegotiationModelWrapper(
            this.line,
            this.rfq,
            this.quotation,
            null,
            null,
            this.bpDataService.getCompanySettings().negotiationSettings);

        this.computeRfqNegotiationOptions(this.rfq);

        // we set quotationPriceWrapper's presentationMode to be sure that the total price of quotation response will not be changed
        this.wrapper.quotationDiscountPriceWrapper.presentationMode = this.getPresentationMode();

        this.userRole = this.bpDataService.bpActivityEvent.userRole;

        // check associated frame contract
        this.bpeService.getFrameContract(UBLModelUtils.getPartyId(this.rfq.sellerSupplierParty.party),
            UBLModelUtils.getPartyId(this.rfq.buyerCustomerParty.party),
            this.rfq.requestForQuotationLine[0].lineItem.item.manufacturersItemIdentification.id).then(digitalAgreement => {
            this.frameContract = digitalAgreement;
        });
    }

    computeRfqNegotiationOptions(rfq: RequestForQuotation) {
        if(!rfq.negotiationOptions) {
            rfq.negotiationOptions = new NegotiationOptions();
            rfq.negotiationOptions.deliveryPeriod = this.wrapper.lineDeliveryPeriodString !== this.wrapper.rfqDeliveryPeriodString;
            rfq.negotiationOptions.incoterms = this.wrapper.lineIncoterms !== this.wrapper.rfqIncoterms;
            rfq.negotiationOptions.paymentMeans = this.wrapper.linePaymentMeans !== this.wrapper.rfqPaymentMeans;
            rfq.negotiationOptions.paymentTerms = this.wrapper.linePaymentTerms !== this.wrapper.rfqPaymentTermsToString;
            rfq.negotiationOptions.price = this.wrapper.lineDiscountPriceWrapper.pricePerItem !== this.wrapper.rfqDiscountPriceWrapper.itemPrice.value;
            rfq.negotiationOptions.warranty = this.wrapper.lineWarrantyString !== this.wrapper.rfqWarrantyString;
        }
    }

    onBack(): void {
        this.location.back();
    }

    onRespondToQuotation(accepted: boolean) {
        if (!isValidPrice(this.wrapper.quotationDiscountPriceWrapper.totalPrice)) {
            alert("Price cannot have more than 2 decimal places");
            return false;
        }
        if(accepted) {
            if(this.hasUpdatedTerms()) {
                this.quotation.documentStatusCode.name = NEGOTIATION_RESPONSES.TERMS_UPDATED;
            } else {
                this.quotation.documentStatusCode.name = NEGOTIATION_RESPONSES.ACCEPTED;
            }
        } else {
            this.quotation.documentStatusCode.name = NEGOTIATION_RESPONSES.REJECTED;
        }

        this.callStatus.submit();
        const vars: ProcessVariables = ModelUtils.createProcessVariables("Negotiation", UBLModelUtils.getPartyId(this.bpDataService.requestForQuotation.buyerCustomerParty.party),
            UBLModelUtils.getPartyId(this.bpDataService.requestForQuotation.sellerSupplierParty.party),this.cookieService.get("user_id"), this.quotation, this.bpDataService);
        const piim: ProcessInstanceInputMessage = new ProcessInstanceInputMessage(vars, this.processMetadata.processId);

        this.bpeService.continueBusinessProcess(piim).then(() => {
            this.callStatus.callback("Quotation sent", true);
            var tab = "PUCHASES";
            if (this.bpDataService.bpActivityEvent.userRole == "seller")
                tab = "SALES";
            this.router.navigate(['dashboard'], {queryParams: {tab: tab}});

        }).catch(error => {
            this.callStatus.error("Failed to send quotation", error);
        });
    }

    onRequestNewQuotation() {
        this.bpDataService.initRfqWithQuotation();
        this.bpDataService.proceedNextBpStep("buyer", "Negotiation");
    }

    onAcceptAndOrder() {
        this.bpDataService.initOrderWithQuotation();
        this.bpDataService.proceedNextBpStep("buyer", "Order");
    }

    onTotalPriceChanged(totalPrice: number): void {
        this.wrapper.quotationDiscountPriceWrapper.totalPrice = totalPrice;
    }

    /*
     * Getters and Setters
     */

    isLoading(): boolean {
        return false;
    }

    isDisabled(): boolean {
        return this.isLoading() || this.readonly;
    }

    getPresentationMode(): "edit" | "view" {
        return this.isReadOnly() ? "view" : "edit";
    }

    isReadOnly(): boolean {
        return this.processMetadata == null || this.processMetadata.processStatus !== 'Started' || this.readonly;
    }

    isFrameContractPanelVisible(): boolean {
        return this.wrapper.rfqFrameContractDuration != null;
    }

    isDiscountIconVisibleInCustomerRequestColumn(): boolean {
        console.log("rfq: " + this.wrapper.rfqTotalPriceString);
        console.log("line: " + this.wrapper.lineDiscountPriceWrapper.totalPriceString)

        return this.wrapper.quotationDiscountPriceWrapper.appliedDiscounts.length > 0 &&
            this.wrapper.rfqTotalPriceString == this.wrapper.lineDiscountPriceWrapper.totalPriceString;
    }

    get quotationPrice(): number {
        return this.wrapper.quotationDiscountPriceWrapper.totalPrice;
    }

    set quotationPrice(price: number) {
        this.wrapper.quotationDiscountPriceWrapper.totalPrice = price;
    }

    getContractEndDate(): string {
        let rangeUnit: string;
        switch (this.wrapper.quotationFrameContractDuration.unitCode) {
            case "year(s)": rangeUnit = 'y'; break;
            case "month(s)": rangeUnit = 'M'; break;
            case "week(s)": rangeUnit = 'w'; break;
            case "day(s)": rangeUnit = 'd'; break;
        }
        let m:Moment = moment().add(this.wrapper.quotationFrameContractDuration.value, <unitOfTime.DurationConstructor>rangeUnit);
        let date: string = m.format(this.dateFormat);
        return date;
    }

    isFormValid(): boolean {
        // TODO check other elements
        return this.isFrameContractDurationValid();
    }

    /*
     * Internal Methods
     */

    hasUpdatedTerms(): boolean {
        if(this.rfq.negotiationOptions.deliveryPeriod) {
            if(!UBLModelUtils.areQuantitiesEqual(this.wrapper.rfqDeliveryPeriod, this.wrapper.quotationDeliveryPeriodWithPriceCheck)) {
                return true;
            }
        }
        if(this.rfq.negotiationOptions.incoterms) {
            if(this.wrapper.rfqIncoterms !== this.wrapper.quotationIncoterms) {
                return true;
            }
        }
        if(this.rfq.negotiationOptions.paymentMeans) {
            if(this.wrapper.rfqPaymentMeans !== this.wrapper.quotationPaymentMeans) {
                return true;
            }
        }
        if(this.rfq.negotiationOptions.paymentTerms) {
            if(this.wrapper.rfqPaymentTerms.paymentTerm !== this.wrapper.quotationPaymentTerms.paymentTerm) {
                return true;
            }
        }
        if(this.wrapper.rfqDiscountPriceWrapper.totalPriceString !== this.wrapper.quotationDiscountPriceWrapper.totalPriceString) {
            return true;
        }
        if(this.rfq.negotiationOptions.warranty) {
            if(!UBLModelUtils.areQuantitiesEqual(this.wrapper.rfqWarranty, this.wrapper.quotationWarranty)) {
                return true;
            }
        }
        if(!UBLModelUtils.areQuantitiesEqual(this.wrapper.rfqFrameContractDuration, this.wrapper.quotationFrameContractDuration)) {
            return true;
        }

        return false;
    }

    private isFrameContractDurationValid(): boolean {
        if(this.frameContract.digitalAgreementTerms.validityPeriod.durationMeasure.unitCode != null &&
            this.frameContract.digitalAgreementTerms.validityPeriod.durationMeasure.value != null) {
            return true;
        }
        return false;
    }

    private openDiscountModal(): void{
        this.discountModal.open(this.wrapper.quotationDiscountPriceWrapper.appliedDiscounts,this.wrapper.quotationDiscountPriceWrapper.price.priceAmount.currencyID);
    }
}
