import {Component, Input, OnInit} from '@angular/core';
import { Order } from "../../../catalogue/model/publish/order";
import { CallStatus } from "../../../common/call-status";
import { BPDataService } from "../bp-data-service";
import { Location } from "@angular/common";
import { PaymentTermsWrapper } from "../payment-terms-wrapper";
import { Router } from "@angular/router";
import {copy, quantityToString, roundToTwoDecimals} from '../../../common/utils';
import { UBLModelUtils } from "../../../catalogue/model/ubl-model-utils";
import { UserService } from "../../../user-mgmt/user.service";
import { CookieService } from "ng2-cookies";
import { CustomerParty } from "../../../catalogue/model/publish/customer-party";
import { SupplierParty } from "../../../catalogue/model/publish/supplier-party";
import { BPEService } from "../../bpe.service";
import { BpUserRole } from "../../model/bp-user-role";
import { OrderResponseSimple } from "../../../catalogue/model/publish/order-response-simple";
import { PriceWrapper } from "../../../common/price-wrapper";
import { Party } from "../../../catalogue/model/publish/party";
import { Quotation } from "../../../catalogue/model/publish/quotation";
import { Address } from "../../../catalogue/model/publish/address";
import { SearchContextService } from "../../../simple-search/search-context.service";
import { EpcCodes } from "../../../data-channel/model/epc-codes";
import { EpcService } from "../epc-service";
import {DocumentService} from "../document-service";
import {ThreadEventMetadata} from '../../../catalogue/model/publish/thread-event-metadata';
import * as myGlobals from '../../../globals';
import {Contract} from '../../../catalogue/model/publish/contract';
import {BinaryObject} from "../../../catalogue/model/publish/binary-object";
import {TranslateService} from '@ngx-translate/core';
import {DocumentReference} from "../../../catalogue/model/publish/document-reference";
import {CatalogueLine} from '../../../catalogue/model/publish/catalogue-line';
import {Item} from '../../../catalogue/model/publish/item';

/**
 * Created by suat on 20-Sep-17.
 */
@Component({
    selector: "order",
    templateUrl: "./order.component.html",
    styleUrls: ["./order.component.css"]
})
export class OrderComponent implements OnInit {

    @Input() selectedLineIndex:number;
    // whether the process details are viewed for all products in the negotiation
    @Input() areProcessDetailsViewedForAllProducts:boolean;
    order: Order;
    address: Address
    orderResponse: OrderResponseSimple;
    lastQuotation: Quotation;
    priceWrappers: PriceWrapper[];
    userRole: BpUserRole;
    config = myGlobals.config;

    buyerParty: Party;
    sellerParty: Party;
    isPaymentDone: boolean = false;

    epcCodes: EpcCodes;
    savedEpcCodes: EpcCodes;
    productionTemplateFile: BinaryObject[] = [];
    initEpcCodesCallStatus: CallStatus = new CallStatus();
    saveEpcCodesCallStatus: CallStatus = new CallStatus();
    updateOrderResponseCallStatus: CallStatus = new CallStatus();

    initCallStatus: CallStatus = new CallStatus();
    submitCallStatus: CallStatus = new CallStatus();
    fetchDataMonitoringStatus: CallStatus = new CallStatus();

    // the copy of ThreadEventMetadata of the current business process
    processMetadata: ThreadEventMetadata;

    getPartyId = UBLModelUtils.getPartyId;

    selectedPanel: string;
    selectedTCTab: 'CUSTOM_TERMS' | 'CLAUSES' = 'CUSTOM_TERMS';
    selectedTrackAndTraceTab: 'EPC_CODES' | 'PRODUCTION_PROCESS_TEMPLATE' = 'EPC_CODES';

    // map representing the workflow of seller's company
    companyWorkflowMap = null;

    quantityToString = quantityToString;

    constructor(public bpDataService: BPDataService,
                private userService: UserService,
                private bpeService: BPEService,
                private cookieService: CookieService,
                private searchContextService: SearchContextService,
                private epcService: EpcService,
                private location: Location,
                private router: Router,
                private translate: TranslateService,
                private documentService: DocumentService) {
    }

    ngOnInit(): void {
        // initiate order according to existence of variables from the previous business process step
        if (this.bpDataService.order == null) {
            // quotation is available. This means that the order is navigated from a completed negotiation process
            if (this.bpDataService.copyQuotation) {
                this.bpDataService.initOrderWithQuotation();

                // quotation is not available meaning that the user has used the manufacturer's terms
            } else {
                this.bpDataService.initOrderWithRfq();
            }
        }

        // get copy of ThreadEventMetadata of the current business process
        this.processMetadata = this.bpDataService.bpActivityEvent.processMetadata;

        this.order = this.bpDataService.order;
        this.userRole = this.bpDataService.bpActivityEvent.userRole;
        this.orderResponse = this.bpDataService.orderResponse;

        this.priceWrappers = [];
        for(let orderLine of this.order.orderLine){
            this.priceWrappers.push(new PriceWrapper(
                orderLine.lineItem.price,
                this.getCatalogueLine(orderLine.lineItem.item).requiredItemLocationQuantity.applicableTaxCategory[0].percent,
                orderLine.lineItem.quantity,
                orderLine.lineItem.item
            )) ;
        }

        this.companyWorkflowMap = this.bpDataService.getCompanyWorkflowMap(null);

        const sellerId: string = UBLModelUtils.getPartyId(this.order.orderLine[0].lineItem.item.manufacturerParty);
        const buyerId: string = this.cookieService.get("company_id");
        this.initCallStatus.submit();

        // null check is for checking whether a new order is initialized
        // preceding process id check is for checking whether there is any preceding process before the order
        if(this.getNonTermAndConditionContract() == null && this.bpDataService.precedingProcessId != null) {
            Promise.all([
                this.bpeService.constructContractForProcess(this.bpDataService.precedingProcessId,this.order.orderLine[0].lineItem.item.manufacturerParty.federationInstanceID),
                this.userService.getParty(buyerId),
                this.userService.getParty(sellerId,this.order.orderLine[0].lineItem.item.manufacturerParty.federationInstanceID),
                this.bpeService.isPaymentDone(this.order.id,this.order.orderLine[0].lineItem.item.manufacturerParty.federationInstanceID)
            ])
                .then(([contract, buyerParty, sellerParty,isPaymentDone]) => {
                    this.buyerParty = buyerParty;
                    this.sellerParty = sellerParty;
                    this.isPaymentDone = isPaymentDone == "true";
                    this.order.contract.push(contract);
                    this.initCallStatus.callback("Initialized", true);

            }).catch(error => {
                this.initCallStatus.error("Error while initializing", error);
            });

        } else {
            Promise.all([
                this.userService.getParty(buyerId),
                this.userService.getParty(sellerId,this.order.orderLine[0].lineItem.item.manufacturerParty.federationInstanceID),
                this.bpeService.isPaymentDone(this.order.id,this.order.orderLine[0].lineItem.item.manufacturerParty.federationInstanceID)
            ]).then(([buyerParty, sellerParty, isPaymentDone]) => {
                this.buyerParty = buyerParty;
                this.sellerParty = sellerParty;
                this.isPaymentDone = isPaymentDone == "true";
                this.initCallStatus.callback("Initialized", true);
            })
            .catch(error => {
                this.initCallStatus.error("Error while initializing", error);
            });
        }

        if(this.orderResponse) {
            this.initializeEPCCodes();
            let productionTemplateFile: DocumentReference = this.getProductionTemplateFromOrderResponse();
            if (productionTemplateFile != null) {
                this.productionTemplateFile = [productionTemplateFile.attachment.embeddedDocumentBinaryObject]
            }
        }
    }

    private getCatalogueLine(item:Item):CatalogueLine{
        for(let catalogueLine of this.bpDataService.getCatalogueLines()){
            if(item.catalogueDocumentReference.id == catalogueLine.goodsItem.item.catalogueDocumentReference.id &&
                item.manufacturersItemIdentification.id == catalogueLine.goodsItem.item.manufacturersItemIdentification.id){
                return catalogueLine;
            }
        }
        return null;
    }

    // retrieve the order contract which is not the Term and Condition contract
    getNonTermAndConditionContract(){
        if(this.order.contract){
            for(let contract of this.order.contract){
                for(let clause of contract.clause){
                    if(clause.type){
                        return contract;
                    }
                }
            }
        }
        return null;
    }

    trackByFn(index: any) {
        return index;
    }

    /*
     * Event Handlers
     */

    onBack() {
        this.location.back();
    }

    onOrder() {
        this.submitCallStatus.submit();
        const order = copy(this.bpDataService.order);

        // final check on the order
        order.anticipatedMonetaryTotal.payableAmount.value = this.getTotalPrice();
        order.anticipatedMonetaryTotal.payableAmount.currencyID = this.priceWrappers[0].currency;

        //first initialize the seller and buyer parties.
        //once they are fetched continue with starting the ordering process
        order.buyerCustomerParty = new CustomerParty(this.buyerParty);
        order.sellerSupplierParty = new SupplierParty(this.sellerParty);

        this.bpeService.startProcessWithDocument(order,this.sellerParty.federationInstanceID)
            .then(res => {
                this.submitCallStatus.callback("Order placed", true);
                var tab = "PURCHASES";
                if (this.bpDataService.bpActivityEvent.userRole == "seller")
                  tab = "SALES";
                this.router.navigate(['dashboard'], {queryParams: {tab: tab}});
            }).catch(error => {
                this.submitCallStatus.error("Failed to send Order", error);
            });
    }

    onOrderUpdate() {
        if(!this.areProcessDetailsViewedForAllProducts){
            alert("Please, make sure that you view the order details of all products before sending your request!");
            return;
        }
        this.submitCallStatus.submit();
        const order = copy(this.bpDataService.order);

        this.bpeService.updateBusinessProcess(JSON.stringify(order),"ORDER",this.processMetadata.processInstanceId,this.processMetadata.sellerFederationId)
            .then(() => {
                this.documentService.updateCachedDocument(order.id,order);
                this.submitCallStatus.callback("Order updated", true);
                var tab = "PURCHASES";
                if (this.bpDataService.bpActivityEvent.userRole == "seller")
                  tab = "SALES";
                this.router.navigate(['dashboard'], {queryParams: {tab: tab}});
            })
            .catch(error => {
                this.submitCallStatus.error("Failed to update Order", error);
            });
    }

    onRespondToOrder(accepted: boolean): void {
        if(!this.areProcessDetailsViewedForAllProducts){
            alert("Please, make sure that you view the order details of all products before sending your response!");
            return;
        }
        this.submitCallStatus.submit();
        this.bpDataService.orderResponse.acceptedIndicator = accepted;

        //this.submitCallStatus.submit();
        this.bpeService.startProcessWithDocument(this.bpDataService.orderResponse,this.bpDataService.orderResponse.sellerSupplierParty.party.federationInstanceID)
            .then(res => {
                this.submitCallStatus.callback("Order Response placed", true);
                var tab = "PURCHASES";
                if (this.bpDataService.bpActivityEvent.userRole == "seller")
                  tab = "SALES";
                this.router.navigate(['dashboard'], {queryParams: {tab: tab}});
            }).catch(error => {
                this.submitCallStatus.error("Failed to send Order Response", error);
            });
    }

    onDownloadContact() {
        this.submitCallStatus.submit();
        this.bpeService.downloadContractBundle(this.order.id,this.order.sellerSupplierParty.party.federationInstanceID)
            .then(result => {
                const link = document.createElement('a');
                link.id = 'downloadLink';
                link.href = window.URL.createObjectURL(result.content);
                link.download = result.fileName;

                document.body.appendChild(link);
                const downloadLink = document.getElementById('downloadLink');
                downloadLink.click();
                document.body.removeChild(downloadLink);
                this.submitCallStatus.callback("Bundle successfully downloaded.", true);
            },
            error => {
                this.submitCallStatus.error("Error while downloading bundle.", error);
            });
    }

    onPaymentDone(){
        this.submitCallStatus.submit();
        this.bpeService.paymentDone(this.order.id,this.sellerParty.federationInstanceID).then(response => {
            this.isPaymentDone = true;
            this.submitCallStatus.callback(null,true);
        }).catch(error => {
            this.submitCallStatus.error("Error while processing the payment", error);
        })
    }

    onDispatchOrder() {
        this.bpDataService.setCopyDocuments(false, false, true,false);
        this.bpDataService.proceedNextBpStep(this.userRole, "Fulfilment");
    }

    onSearchTransportService() {
        this.searchContextService.setSearchContext(this.processMetadata);
        this.router.navigate(['simple-search'], {
            queryParams: {
                searchContext: 'orderbp',
                q:'*',
                cat:'Transport Service',
                catID:'nimble:category:TransportService'
            }
        });
    }

    onDeleteEpcCode(i: number) {
        this.epcCodes.codes.splice(i, 1);
    }

    onSaveEpcCodes() {
        this.saveEpcCodesCallStatus.submit();
        // remove empty codes
        const selectedEpcCodes = [];
        for(const code of this.epcCodes.codes) {
            if(code) {
                selectedEpcCodes.push(code);
            }
        }

        // remove the empty codes also from the displayed list
        this.epcCodes.codes = this.epcCodes.codes.filter(code => code);

        const codes = new EpcCodes(this.order.id, selectedEpcCodes);

        this.epcService.registerEpcCodes(codes)
            .then(() => {
                this.savedEpcCodes = codes;
                this.saveEpcCodesCallStatus.callback("EPC Codes are saved.", true);
            }).catch(error => {
                this.saveEpcCodesCallStatus.error("Failed to save EPC Codes.", error);
            });
    }

    onTTTabSelect(event:any,id:any): void {
        event.preventDefault();
        this.selectedTrackAndTraceTab = id;
    }

    onTTFileSelected(binaryObject: BinaryObject): void {
        let documentReference: DocumentReference = UBLModelUtils.createDocumentReferenceWithBinaryObject(binaryObject);
        documentReference.documentType = 'PRODUCTIONTEMPLATE';
        this.orderResponse.additionalDocumentReference = [];
        this.orderResponse.additionalDocumentReference.push(documentReference);
    }

    onTTFileRemoved(): void {
        this.orderResponse.additionalDocumentReference = [];
    }

    onUpdateOrderResponse(): void {
        this.updateOrderResponseCallStatus.submit();

        this.documentService.updateDocument(this.orderResponse.id, 'ORDERRESPONSESIMPLE', JSON.stringify(this.orderResponse),this.orderResponse.sellerSupplierParty.party.federationInstanceID)
            .then(() => {
                this.updateOrderResponseCallStatus.callback("Production template file added to the order response", true);
            })
            .catch(error => {
                this.updateOrderResponseCallStatus.error("Failed to add production template to the order response", error);
            });
    }

    onAddEpcCode() {
        this.epcCodes.codes.push("");
    }

    onTCTabSelect(event:any,id:any): void {
        event.preventDefault();
        this.selectedTCTab = id;
    }

    /*
     * Getters & Setters
     */

    isBuyer(): boolean {
        return this.userRole === "buyer";
    }

    isSeller(): boolean {
        return this.userRole === "seller";
    }

    isReady(): boolean {
        return !this.initCallStatus.isDisplayed() && !!this.order;
    }

    isLoading(): boolean {
        return this.submitCallStatus.fb_submitted;
    }

    isOrderCompleted(): boolean {
        return this.processMetadata && this.processMetadata.processStatus === "Completed";
    }

    isOrderRejected(): boolean {
        return this.isOrderCompleted() && !this.bpDataService.orderResponse.acceptedIndicator;
    }

    isReadOnly(): boolean {
        if(this.userRole === "buyer") {
            return !!this.processMetadata && !this.processMetadata.isBeingUpdated;
        }
        return this.isOrderCompleted();
    }

    isEpcTabShown(): boolean {
        return this.isReady() && this.isOrderCompleted() && this.config.showTrack;
    }

    isDispatchDisabled(): boolean {
        return this.isLoading() || this.isOrderRejected() || this.isThereADeletedProduct() || this.processMetadata.isCollaborationFinished;
    }

    areEpcCodesDirty(): boolean {
        if(!this.epcCodes || !this.savedEpcCodes) {
            return false;
        }

        const codes = this.epcCodes.codes;
        const saved = this.savedEpcCodes.codes;

        if(codes.length !== saved.length) {
            return true;
        }

        for(let i = 0; i < saved.length; i++) {
            if(codes[i] !== saved[i]) {
                return true;
            }
        }

        return false;
    }

    isThereAValidEPCCode(): boolean {
        if(this.epcCodes) {
            for(let code of this.epcCodes.codes) {
                if(code) {
                    return true;
                }
            }
        }
        return false;
    }

    getProductionTemplateFromOrderResponse(): DocumentReference {
        let ttDocRef = this.orderResponse.additionalDocumentReference.filter(docRef => docRef.documentType === 'PRODUCTIONTEMPLATE');
        if(ttDocRef.length > 0) {
            return ttDocRef[0];
        }
        return null;
    }

    /*
     *
     */

    private initializeEPCCodes() {
        if(this.processMetadata
            && this.processMetadata.processStatus == 'Completed'
            && this.bpDataService.orderResponse.acceptedIndicator
            && this.config.showTrack) {
            this.initEpcCodesCallStatus.submit();
            this.epcService.getEpcCodes(this.order.id).then(res => {
                this.epcCodes = res;
                if(this.epcCodes.codes == null){
                    this.epcCodes.codes = [];
                }
                this.epcCodes.codes.sort();
                this.savedEpcCodes = copy(this.epcCodes);
                this.initEpcCodesCallStatus.callback("EPC Codes initialized", true);
            }).catch(error => {
                if(error.status && error.status == 404) {
                    this.epcCodes = new EpcCodes(this.order.id,[]);
                    this.savedEpcCodes = new EpcCodes(this.order.id,[]);
                    this.initEpcCodesCallStatus.callback("EPC Codes initialized", true);
                } else {
                    this.initEpcCodesCallStatus.error("Error while initializing EPC Codes", error);
                }
            })
        }
    }

    getOrderContract():Contract{
        let orderContract = null;
        if(this.order.contract){
            for(let contract of this.order.contract){
                for(let clause of contract.clause){
                    if(clause.type){
                        orderContract = contract;
                        break;
                    }
                }
            }
        }
        return orderContract;
    }

    getTotalPrice(){
        let totalPrice = 0;
        for(let priceWrapper of this.priceWrappers){
            totalPrice += priceWrapper.totalPrice;
        }
        return roundToTwoDecimals(totalPrice);
    }

    getTotalPriceString(){
        let totalPrice = 0;
        for(let priceWrapper of this.priceWrappers){
            totalPrice += priceWrapper.totalPrice;
        }
        return roundToTwoDecimals(totalPrice) + " " + this.priceWrappers[0].currency;
    }

    getVatTotalString(){
        let vatTotal = 0;
        for(let priceWrapper of this.priceWrappers){
            vatTotal += priceWrapper.vatTotal
        }
        return roundToTwoDecimals(vatTotal) + " " + this.priceWrappers[0].currency;
    }

    getGrossTotalString(){
        let grossTotal = 0;
        for(let priceWrapper of this.priceWrappers){
            grossTotal += priceWrapper.grossTotal;
        }
        return roundToTwoDecimals(grossTotal) + " " + this.priceWrappers[0].currency;
    }

    isThereADeletedProduct():boolean{
        for(let isProductDeleted of this.processMetadata.areProductsDeleted){
            if(isProductDeleted){
                return true;
            }
        }
        return false;
    }

    isPaymentButtonDisabled():boolean{
        return this.isLoading() || this.isOrderRejected() || this.isPaymentDone;
    }
}
