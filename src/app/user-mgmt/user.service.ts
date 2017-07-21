import { Injectable } from '@angular/core';
import { Headers, Http } from '@angular/http';
import 'rxjs/add/operator/toPromise';
import { User } from './model/user';
import * as myGlobals from '../globals';
import {Party} from "../catalogue/model/publish/party";
import {PartyName} from "../catalogue/model/publish/party-name";
import { CompanySettings } from './model/company-settings';

@Injectable()
export class UserService {

	private headers = new Headers({'Content-Type': 'application/json'});
	private url = myGlobals.user_mgmt_endpoint;
	private userParty: Party;

	constructor(private http: Http) { }

	post(user: User): Promise<any> {
		const url = `${this.url}/registerCompany`;
		return this.http
		.post(url, JSON.stringify(user), {headers: this.headers})
		.toPromise()
		.then(res => res.json())
		.catch(this.handleError);
	}

	getUserParty(userId: string): Promise<Party> {
		if(this.userParty != null) {
			return Promise.resolve(this.userParty);
		}
		const url = `${this.url}/party_by_person/${userId}`;
		return this.http
		.get(url, {headers: this.headers})
		.toPromise()
		.then(res => {

			let partyObj = res.json()[0];
			console.log(url + ' returned ' + JSON.stringify(partyObj));

			// ToDo: make identity service using the latest version of the data model
			let names:PartyName[] = [new PartyName(res.json()[0].partyName[0].name)];
			this.userParty = new Party(res.json()[0].hjid, names, null);
			return Promise.resolve(this.userParty);
		})
		.catch(this.handleError);
	}

    getSettings(userId: string): Promise<CompanySettings> {

        return this.getUserParty(userId).then(party => {
            const url = `${this.url}/company-settings/${party.id}`;
            return this.http
                .get(url, {headers: this.headers})
                .toPromise()
                .then(response => response.json() as CompanySettings)
                .catch(this.handleError)
        });
    }

	putSettings(settings: CompanySettings, userId: string): Promise<any> {
		return this.getUserParty(userId).then(party => {
			const url = `${this.url}/company-settings/${party.id}`;
			return this.http
                .put(url, settings, {headers: this.headers})
                .toPromise()
                .then(response => response.json())
                .catch(this.handleError)
		});
	}

	resetData():void {
		this.userParty = null;
	}

	private handleError(error: any): Promise<any> {
		console.error('An error occurred', error); // for demo purposes only
		return Promise.reject(error.message || error);
	}

}