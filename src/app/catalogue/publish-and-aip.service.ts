/*
 * Copyright 2020
 * SRDC - Software Research & Development Consultancy; Ankara; Turkey
   In collaboration with
 * SRFG - Salzburg Research Forschungsgesellschaft mbH; Salzburg; Austria
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

import {Injectable} from '@angular/core';
import {PublishMode} from './model/publish/publish-mode';
import {ItemProperty} from './model/publish/item-property';

@Injectable()
export class PublishService {
    publishMode: PublishMode = 'create';
    // flag if the product publishing is started or not
    publishingStarted: boolean = false;
    // fields for associated product
    // associated products selected in the search process to be associated to the published product
    selectedProductsInSearch: any[] = null;
    // product for which the user is searching associated products.
    itemPropertyLinkedToOtherProducts: ItemProperty = null;

    // end of fields for associated product functionality

    resetData(publishMode: PublishMode = 'create') {
        this.publishMode = publishMode;
        this.publishingStarted = false;
    }
}
