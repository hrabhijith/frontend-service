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

import { Injectable } from '@angular/core';
import { ResponseContentType, Http, RequestOptions, Headers } from '@angular/http';
import { CookieService } from 'ng2-cookies';
import 'rxjs/add/operator/toPromise';
import { Observable } from 'rxjs/Observable';
import { Subscriber } from 'rxjs/Subscriber';
import * as myGlobals from '../globals';
import { Party } from "../catalogue/model/publish/party";
import { CompanySettings } from './model/company-settings';
import { UserRegistration } from './model/user-registration';
import { CompanyRegistration } from './model/company-registration';
import { CompanyInvitation } from './model/company-invitation';
import { UBLModelUtils } from "../catalogue/model/ubl-model-utils";
import { UserRole } from './model/user-role';
import { CompanyNegotiationSettings } from './model/company-negotiation-settings';
import { CatalogueLine } from '../catalogue/model/publish/catalogue-line';
import {DEFAULT_LANGUAGE, FEDERATION, FEDERATIONID, INCOTERMS, PAYMENT_MEANS} from '../catalogue/model/constants';
import { Person } from '../catalogue/model/publish/person';
import { ResetPasswordCredentials } from './model/reset-password-credentials';
import { UnitService } from "../common/unit-service";
import { deliveryPeriodUnitListId, warrantyPeriodUnitListId } from "../common/constants";
import { Certificate } from "../catalogue/model/publish/certificate";
import { copy } from '../common/utils';
import {PeriodRange} from './model/period-range';
import {AccountLink} from './model/account-link';
import {Code} from '../catalogue/model/publish/code';
import {DocumentReference} from '../catalogue/model/publish/document-reference';

@Injectable()
export class UserService {

    private headers = new Headers({ 'Content-Type': 'application/json' });
    private url = myGlobals.user_mgmt_endpoint;

    private delegate_url = myGlobals.delegate_endpoint;

    private delegated = (FEDERATION() == "ON");

    userParty: Party;

    // used to cache user info
    // key of the outer map is federation id
    // key of the inner map is user id
    private mapOfUsers: Map<string, Map<string, Person>> = new Map();


    companyNegotiationSettings: Map<string, CompanyNegotiationSettings> = new Map<string, CompanyNegotiationSettings>();

    constructor(
        private unitService: UnitService,
        private http: Http,
        private cookieService: CookieService
    ) { }

    setWelcomeFlag(flag: boolean): Promise<any> {
        const url = `${this.url}/set-welcome-info/${flag}`;
        let headers = this.getAuthorizedHeaders();
        return this.http
            .post(url, JSON.stringify({}), { headers: headers, withCredentials: true })
            .toPromise()
            .then(res => res)
            .catch(this.handleError);
    }

    registerUser(user: UserRegistration): Promise<any> {
        const url = `${this.url}/register/user`;
        return this.http
            .post(url, JSON.stringify(user), { headers: this.headers, withCredentials: true })
            .toPromise()
            .then(res => res.json())
            .catch(this.handleError);
    }

    deleteUser(userId: string): Promise<any> {
        const url = `${this.url}/admin/delete_user/${userId}`;
        let headers = this.getAuthorizedHeaders();
        return this.http
            .delete(url, { headers: headers, withCredentials: true })
            .toPromise()
            .then(res => res)
            .catch(this.handleError);
    }

    registerCompany(company: CompanyRegistration) {
        const url = `${this.url}/register/company`;
        let headers = this.getAuthorizedHeaders();
        return this.http
            .post(url, JSON.stringify(company), { headers: headers, withCredentials: true })
            .toPromise()
            .then(res => res.json())
            .catch(this.handleError);
    }

    deleteCompany(companyId: string): Promise<any> {
        const userId = this.cookieService.get("user_id");
        const url = `${this.url}/admin/delete_company/${companyId}?userId=${userId}`;
        let headers = this.getAuthorizedHeaders();
        return this.http
            .delete(url, { headers: headers, withCredentials: true })
            .toPromise()
            .then(res => res)
            .catch(this.handleError);
    }

    getCompanyMemberList(partyId?: string) {
        let ownerCompanyId = this.cookieService.get("company_id");
        if (partyId != null) {
            ownerCompanyId = partyId;
        }
        const url = `${this.url}/company_members/${ownerCompanyId}`;
        let headers = this.getAuthorizedHeaders();
        return this.http
            .get(url, { headers: headers, withCredentials: true })
            .toPromise()
            .then(res => res.json())
            .catch(this.handleError);
    }

    deleteInvite(email: string) {
        var encodedMail = encodeURIComponent(email);
        const url = `${this.url}/invitations?username=${encodedMail}`;
        let headers = this.getAuthorizedHeaders();
        return this.http
            .delete(url, { headers: headers, withCredentials: true })
            .toPromise()
            .then(res => res.json())
            .catch(this.handleError);
    }

    inviteCompany(invitation: CompanyInvitation) {
        const url = `${this.url}/send_invitation`;
        let headers = this.getAuthorizedHeaders();
        return this.http
            .post(url, JSON.stringify(invitation), { headers: headers, withCredentials: true })
            .toPromise()
            .then(res => res)
            .catch(this.handleError);
    }

    connectStripe(accountId:string,partyId:string):Promise<AccountLink> {
        let url = `${this.url}/account?partyId=${partyId}`;
        if(accountId)
            url += `&id=${accountId}`;
        let headers = this.getAuthorizedHeaders();
        return this.http.post(url, {}, {headers: headers})
            .toPromise()
            .then(resp => {
                return resp.json();
            })
    }

    deleteAccount(accountId:string):Promise<string> {
        let headers = this.getAuthorizedHeaders();
        return this.http.delete(`${this.url}/account?id=${accountId}`,  {headers: headers})
            .toPromise()
            .then(resp => {
                return resp.text();
            })
    }

    getAccountLoginLink(accountId:string):Promise<string> {
        let headers = this.getAuthorizedHeaders();
        return this.http.get(`${this.url}/account/login-link?id=${accountId}`, {headers: headers})
            .toPromise()
            .then(resp => {
                return resp.text();
            })
    }

    getParty(partyId: string, delegateId: string = FEDERATIONID(),includeRoles:boolean = false): Promise<Party> {
        let url = `${this.url}/party/${partyId}?includeRoles=${includeRoles}`;
        if (this.delegated) {
            url = `${this.delegate_url}/party/${partyId}?delegateId=${delegateId}&includeRoles=${includeRoles}`;
        }
        let headers = this.getAuthorizedHeaders();
        return this.http
            .get(url, { headers: headers })
            .toPromise()
            .then(res => {
                let party: Party = res.json();
                UBLModelUtils.removeHjidFieldsFromObject(party);
                return Promise.resolve(party);
            })
            .catch(this.handleError);
    }

    getParties(partyIds: string[], delegateIds: string[]): Promise<Party[]> {
        let baseUrl = this.delegated ? this.delegate_url : this.url;
        let url = `${baseUrl}/parties/`;

        let size = partyIds.length;
        for (let i = 0; i < size; i++) {
            url += partyIds[i];
            if (i != size - 1) {
                url += ",";
            }
        }
        if (this.delegated) {
            url += "?delegateIds="
            let size = delegateIds.length;
            for (let i = 0; i < size; i++) {
                url += delegateIds[i];
                if (i != size - 1) {
                    url += "&delegateIds=";
                }
            }
        }
        const headers_token = new Headers({ 'Content-Type': 'application/json' });
        return this.http
            .get(url, { headers: headers_token })
            .toPromise()
            .then(res => {
                let parties: Party[] = res.json();
                for (let party of parties) {
                    UBLModelUtils.removeHjidFieldsFromObject(party);
                }
                return Promise.resolve(parties);
            })
            .catch(this.handleError);
    }

    getPerson(personId: string, delegateId: string = FEDERATIONID()): Promise<Person> {
        if (this.mapOfUsers.has(delegateId) && this.mapOfUsers.get(delegateId).has(personId)) {
            return Promise.resolve(copy(this.mapOfUsers.get(delegateId).get(personId)));
        } else {
            let url = `${this.url}/person/${personId}`;
            if (this.delegated) {
                url = `${this.delegate_url}/person/${personId}?delegateId=${delegateId}`;
            }
            let headers = this.getAuthorizedHeaders();
            return this.http
                .get(url, { headers: headers })
                .toPromise()
                .then(res => {
                    let user = res.json();
                    if (this.mapOfUsers.has(delegateId)) {
                        this.mapOfUsers.get(delegateId).set(personId, user);
                    }
                    else {
                        this.mapOfUsers.set(delegateId, new Map([[personId, user]]));
                    }
                    return copy(user);
                })
                .catch(this.handleError);
        }
    }

    getUserParty(userId: string): Promise<Party> {
        if (this.userParty != null) {
            return Promise.resolve(this.userParty);
        }
        const url = `${this.url}/party_by_person/${userId}`;
        let headers = this.getAuthorizedHeaders();
        return this.http
            .get(url, { headers: headers, withCredentials: true })
            .toPromise()
            .then(res => {
                this.userParty = res.json()[0];
                UBLModelUtils.removeHjidFieldsFromObject(this.userParty);
                return Promise.resolve(this.userParty);
            })
            .catch(this.handleError);
    }

    getSettingsForProduct(line: CatalogueLine): Promise<CompanySettings> {
        return this.getSettingsForParty(UBLModelUtils.getPartyId(line.goodsItem.item.manufacturerParty), line.goodsItem.item.manufacturerParty.federationInstanceID)
            .then(settings => {
                return settings;
            })
    }

    getSettingsForUser(userId: string): Promise<CompanySettings> {
        return this.getUserParty(userId).then(party => this.getSettingsForParty(UBLModelUtils.getPartyId(party)));
    }

    getSettingsForParty(partyId: string, federationId: string = FEDERATIONID()): Promise<CompanySettings> {
        return Promise.all([
            this.getSettingsPromise(partyId, federationId),
            this.getCompanyNegotiationSettingsForParty(partyId, federationId)
        ]).then(([settings, negotiationSettings]) => {
            settings.negotiationSettings = negotiationSettings;
            return settings;
        })
    }

    getProfileCompleteness(partyId: string): Promise<any> {
        const url = `${this.url}/company-settings/${partyId}/completeness`;
        let headers = this.getAuthorizedHeaders();
        return this.http
            .get(url, { headers: headers, withCredentials: true })
            .toPromise()
            .then(response => response.json())
            .catch(this.handleError)
    }

    private getSettingsPromise(partyId: string, delegateId: string): Promise<CompanySettings> {
        let url = `${this.url}/company-settings/${partyId}`;
        if (this.delegated) {
            url = `${this.delegate_url}/company-settings/${partyId}?delegateId=${delegateId}`;
        }
        let headers = this.getAuthorizedHeaders();
        return this.http
            .get(url, { headers: headers })
            .toPromise()
            .then(response => response.json() as CompanySettings)
            .catch(this.handleError)
    }

    resetPassword(credentials: ResetPasswordCredentials): Promise<any> {
        const url = `${this.url}/reset-password`;
        let headers = this.getAuthorizedHeaders();
        return this.http
            .post(url, JSON.stringify(credentials), { headers: headers, withCredentials: true })
            .toPromise()
            .then(res => res)
            .catch(this.handleError);
    }

    getUserRoles(): Promise<UserRole[]> {
        const url = `${this.url}/roles`;
        let headers = this.getAuthorizedHeaders();
        return this.http
            .get(url, { headers: headers, withCredentials: true })
            .toPromise()
            .then(res => {
                let roles: UserRole[] = [];
                const resultJson = res.json();
                for (var roleId in resultJson)
                    roles.push(new UserRole(roleId, resultJson[roleId]));
                return Promise.resolve(roles);
            })
            .catch(this.handleError);
    }

    setRoles(email: string, roleIDs: string[]) {
        const encodedMail = encodeURIComponent(email);
        const url = `${this.url}/roles/user?username=${encodedMail}`;
        let headers = this.getAuthorizedHeaders();
        return this.http
            .post(url, JSON.stringify(roleIDs), { headers: headers, withCredentials: true })
            .toPromise()
            .then(res => res.json())
            .catch(this.handleError);
    }

    putSettings(rawSettings: CompanySettings, userId: string): Promise<any> {
        const settings = { ...rawSettings };
        delete settings.negotiationSettings;
        return this.getUserParty(userId).then(party => {
            const url = `${this.url}/company-settings/${UBLModelUtils.getPartyId(party)}`;
            let headers = this.getAuthorizedHeaders();
            return this.http
                .put(url, settings, { headers: headers, withCredentials: true })
                .toPromise()
                .then(response => response.json())
                .catch(this.handleError)
        });
    }

    putSettingsForParty(rawSettings: CompanySettings, partyId: string): Promise<any> {
        const settings = { ...rawSettings };
        delete settings.negotiationSettings;
        const url = `${this.url}/company-settings/${partyId}`;
        let headers = this.getAuthorizedHeaders();
        return this.http
            .put(url, settings, { headers: headers, withCredentials: true })
            .toPromise()
            .then(response => response.json())
            .catch(this.handleError)
    }

    validateVAT(vat: string): Promise<any> {
        var vat_body = {
            "VatCode": vat.replace(/ /g, "")
        };
        const url = `https://api.cloudmersive.com/validate/vat/lookup`;
        const headers = new Headers({ 'Content-Type': 'application/json', 'Apikey': '28e63794-ef8a-4616-80bb-26fdd3709a19' });
        return this.http
            .post(url, JSON.stringify(vat_body), { headers: headers })
            .toPromise()
            .then(res => res.json())
            .catch(this.handleError);
    }

    getPrefCat(userId: string): Promise<any> {
        return this.getSettingsForUser(userId).then(settings => settings.preferredProductCategories);
    }

    getRecCat(userId: string): Promise<any> {
        return this.getSettingsForUser(userId).then(settings => settings.recentlyUsedProductCategories);
    }

    togglePrefCat(userId: string, cat: string): Promise<any> {
        return this.getSettingsForUser(userId).then(settings => {
            var pref_cat = settings.preferredProductCategories;
            var cat_idx = pref_cat.indexOf(cat);
            if (cat_idx == -1)
                pref_cat.push(cat);
            else
                pref_cat.splice(cat_idx, 1);
            settings.preferredProductCategories = pref_cat;
            return this.putSettings(settings, userId).then(response => response.preferredProductCategories)
        });
    }

    addRecCat(userId: string, cat: string[]): Promise<any> {
        return this.getSettingsForUser(userId).then(settings => {
            var rec_cat = settings.recentlyUsedProductCategories;
            var rec_cat_comp = rec_cat.slice();
            for (var i = 0; i < rec_cat_comp.length; i++) {
                var rec_cat_comp_arr = rec_cat_comp[i].split("::");
                rec_cat_comp[i] = rec_cat_comp_arr[0] + "::" + rec_cat_comp_arr[1] + "::" + rec_cat_comp_arr[2] + "::" + rec_cat_comp_arr[3];
            }
            for (var i = 0; i < cat.length; i++) {
                var cat_arr = cat[i].split("::");
                var cat_comp = cat_arr[0] + "::" + cat_arr[1] + "::" + cat_arr[2] + "::" + cat_arr[3];
                var cat_idx = rec_cat_comp.indexOf(cat_comp);
                if (cat_idx == -1)
                    rec_cat.push(cat[i]);
                else
                    rec_cat[cat_idx] = cat[i];
            }
            if (rec_cat.length > 10) {
                rec_cat.sort((a, b) => b.split("::")[2].localeCompare(a.split("::")[2]));
                rec_cat.sort((a, b) => a.split("::")[4].localeCompare(b.split("::")[4]));
                rec_cat.splice(0, rec_cat.length - 10);
            }
            settings.recentlyUsedProductCategories = rec_cat;
            return this.putSettings(settings, userId).then(response => response.recentlyUsedProductCategories)
        });
    }

    removeRecCat(userId: string, cat: string): Promise<any> {
        return this.getSettingsForUser(userId).then(settings => {
            var rec_cat = settings.recentlyUsedProductCategories;
            var cat_idx = rec_cat.indexOf(cat);
            if (cat_idx != -1)
                rec_cat.splice(cat_idx, 1);
            settings.recentlyUsedProductCategories = rec_cat;
            return this.putSettings(settings, userId).then(response => response.recentlyUsedProductCategories)
        });
    }

    saveSubscriptions(userId: string, categoryCodes:Code[],companyIds:string[]){
        return this.getSettingsForUser(userId).then(settings => {
            settings.subscribedProductCategories = categoryCodes;
            settings.subscribedCompanyIds = companyIds;
            return this.putSettings(settings, userId);
        });
    }

    saveCert(file: File, name: string, description: string, type: string, uri: string,
             partyId: string, certID?: string, langId: string = "en"): Promise<void> {

        if (langId == null || langId == "") {
            langId = "en";
        }
        const url = `${this.url}/company-settings/${partyId}/certificate?name=${name}&description=${description}&type=${type}&certID=${certID}&uri=${uri}&langId=${langId}`;
        const token = 'Bearer ' + this.cookieService.get("bearer_token");
        const headers_token = new Headers({ 'Authorization': token });
        const form_data: FormData = new FormData();
        form_data.append('file', file);
        return this.http
            .post(url, form_data, { headers: headers_token, withCredentials: true })
            .toPromise()
            .then(() => { })
            .catch(this.handleError)
    }

    saveImage(file: File, isLogo: boolean, partyId: string): Promise<void> {
        const url = `${this.url}/company-settings/${partyId}/image?isLogo=${isLogo}`;
        const token = 'Bearer ' + this.cookieService.get("bearer_token");
        const headers_token = new Headers({ 'Authorization': token });
        const form_data: FormData = new FormData();
        form_data.append('file', file);
        return this.http
            .post(url, form_data, { headers: headers_token, withCredentials: true })
            .toPromise()
            .then(() => { })
            .catch(this.handleError)
    }

    deleteImage(id: string, partyId: string): Promise<void> {
        const url = `${this.url}/company-settings/${partyId}/image/${id}`;
        let headers = this.getAuthorizedHeaders();
        return this.http
            .delete(url, { headers: headers, withCredentials: true })
            .toPromise()
            .then(() => { })
            .catch(this.handleError)
    }

    downloadCert(id: string) {
        const url = `${this.url}/company-settings/certificate/${id}`;
        window.open(url, "_blank");
    }

    downloadCertObject(id: string): Promise<Certificate> {
        const url = `${this.url}/company-settings/certificate/${id}/object`;
        let headers = this.getAuthorizedHeaders();
        return this.http
            .get(url, { headers: headers, withCredentials: true })
            .toPromise()
            .then(res => {
                return res.json();
            })
            .catch(this.handleError);
    }

    deleteCert(id: string, partyId: string): Promise<void> {
        const url = `${this.url}/company-settings/${partyId}/certificate/${id}`;
        let headers = this.getAuthorizedHeaders();
        return this.http
            .delete(url, { headers: headers, withCredentials: true })
            .toPromise()
            .then(() => { })
            .catch(this.handleError)
    }

    // getCompanyNegotiationSettingsForUser(userId: string): Promise<CompanyNegotiationSettings> {
    //     return this.getUserParty(userId).then(party => this.getCompanyNegotiationSettingsForParty(UBLModelUtils.getPartyId(party)));
    // }
    //
    // getCompanyNegotiationSettingsForProduct(line: CatalogueLine): Promise<CompanyNegotiationSettings> {
    //     return this.getCompanyNegotiationSettingsForParty(UBLModelUtils.getPartyId(line.goodsItem.item.manufacturerParty));
    // }

    getCompanyNegotiationSettingsForParty(partyId: string, delegateId: string): Promise<CompanyNegotiationSettings> {
        if (this.companyNegotiationSettings.has(partyId)) {
            return Promise.resolve(this.companyNegotiationSettings.get(partyId));
        }

        let url = `${this.url}/company-settings/${partyId}/negotiation/`;
        if (this.delegated) {
            url = `${this.delegate_url}/company-settings/${partyId}/negotiation/?delegateId=${delegateId}`;
        }
        let headers = this.getAuthorizedHeaders();
        return this.http
            .get(url, { headers: headers })
            .toPromise()
            .then(res => {
                return this.sanitizeNegotiationSettings(res.json());
            }).then(settings => {
                this.companyNegotiationSettings.set(partyId, settings);
                return Promise.resolve(settings);
            })
            .catch(this.handleError);
    }

    private async sanitizeNegotiationSettings(settings: CompanyNegotiationSettings): Promise<CompanyNegotiationSettings> {
        let deliveryPeriodUnits = await this.unitService.getCachedUnitList(deliveryPeriodUnitListId);
        let deliveryPeriodRanges: PeriodRange[] = [];
        deliveryPeriodUnits.forEach((unit, index) => {
            let indexInSettings = settings.deliveryPeriodUnits.indexOf(unit);
            if(indexInSettings == -1){
                deliveryPeriodRanges.push(this.getDeliveryPeriodRange(index));
            } else{
                deliveryPeriodRanges.push(settings.deliveryPeriodRanges[indexInSettings]);
            }
        });
        settings.deliveryPeriodUnits = copy(deliveryPeriodUnits);
        settings.deliveryPeriodRanges = copy(deliveryPeriodRanges);
        while (settings.deliveryPeriodRanges.length > 5) {
            settings.deliveryPeriodRanges.pop();
        }
        if (settings.warrantyPeriodUnits.length === 0) {
            settings.warrantyPeriodUnits.push(...await this.unitService.getCachedUnitList(warrantyPeriodUnitListId));
        }
        if (settings.warrantyPeriodRanges.length === 0) {
            settings.warrantyPeriodRanges.push({ start: 0, end: 24 });
            settings.warrantyPeriodRanges.push({ start: 0, end: 2 });
        }
        while (settings.warrantyPeriodRanges.length > 2) {
            settings.warrantyPeriodRanges.pop();
        }

        if (settings.incoterms.length === 0) {
            settings.incoterms.push(...INCOTERMS);
        }
        if (settings.paymentMeans.length === 0) {
            settings.paymentMeans.push(...PAYMENT_MEANS);
        }
        if (settings.paymentTerms.length === 0) {
            settings.paymentTerms.push(...UBLModelUtils.getDefaultPaymentTermsAsStrings());
        }

        return settings;
    }

    private getDeliveryPeriodRange(index:number){
        switch (index) {
            case 0:
                return { start: 24, end: 1344 };
            case 1:
                return { start: 1, end: 40 };
            case 2:
                return { start: 1, end: 56 };
            case 3:
                return { start: 0, end: 8 };
            case 4:
                return { start: 1, end: 12 };
        }
    }

    putCompanyNegotiationSettings(settings: CompanyNegotiationSettings, partyId: string): Promise<void> {
        const url = `${this.url}/company-settings/${partyId}/negotiation`;
        let headers = this.getAuthorizedHeaders();
        return this.http
            .put(url, settings, { headers: headers, withCredentials: true })
            .toPromise()
            .then(() => this.companyNegotiationSettings.set(partyId, settings))
            .catch(this.handleError)
    }

    resetData(): void {
        this.userParty = null;
    }

    private handleError(error: any): Promise<any> {
        return Promise.reject(error.message || error);
    }

    putUserFavourite(uuid: string[], status: number = 1) {
        const userId = this.cookieService.get("user_id");
        const url = `${this.url}/favourite/${userId}?status=${status}`;
        let headers = this.getAuthorizedHeaders();
        return this.http
            .put(url, uuid, { headers: headers, withCredentials: true })
            .toPromise()
            .then(() => {
                // we need to remove user from the cache since this service updates the user info
                let userId = this.cookieService.get("user_id");
                let delegateId = FEDERATIONID();
                if (this.mapOfUsers.has(delegateId) && this.mapOfUsers.get(delegateId).has(userId)) {
                    this.mapOfUsers.get(delegateId).delete(userId);
                }
            })
            .catch(this.handleError)
    }

    saveTermsAndConditions(file: File, partyId: string, certID?: string): Promise<void> {
        const url = `${this.url}/company-settings/${partyId}/termsAndConditions?id=${certID}`;
        const token = 'Bearer ' + this.cookieService.get("bearer_token");
        const headers_token = new Headers({ 'Authorization': token });
        const form_data: FormData = new FormData();
        form_data.append('file', file);
        return this.http
            .post(url, form_data, { headers: headers_token, withCredentials: true })
            .toPromise()
            .then(() => { })
            .catch(this.handleError)
    }

    downloadTermsAndConditions(id: string) {
        const url = `${this.url}/company-settings/termsAndConditions/${id}`;
        window.open(url, "_blank");
    }

    downloadTermsAndConditionsObject(id: string): Promise<DocumentReference> {
        const url = `${this.url}/company-settings/termsAndConditions/${id}/object`;
        let headers = this.getAuthorizedHeaders();
        return this.http
            .get(url, { headers: headers, withCredentials: true })
            .toPromise()
            .then(res => {
                return res.json();
            })
            .catch(this.handleError);
    }

    deleteTermsAndConditions(id: string, partyId: string): Promise<void> {
        const url = `${this.url}/company-settings/${partyId}/termsAndConditions/${id}`;
        let headers = this.getAuthorizedHeaders();
        return this.http
            .delete(url, { headers: headers, withCredentials: true })
            .toPromise()
            .then(() => { })
            .catch(this.handleError)
    }

    private getAuthorizedHeaders(): Headers {
        const token = 'Bearer ' + this.cookieService.get("bearer_token");
        let headers = new Headers({ 'Accept': 'application/json', 'Authorization': token });
        this.headers.keys().forEach(header => headers.append(header, this.headers.get(header)));
        let defaultLanguage = DEFAULT_LANGUAGE();
        let acceptLanguageHeader = defaultLanguage;
        if(defaultLanguage != "en"){
            acceptLanguageHeader += ",en;0.9";
        }
        headers.append("Accept-Language",acceptLanguageHeader);
        return headers;
    }
}
