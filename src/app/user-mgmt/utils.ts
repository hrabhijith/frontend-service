/*
 * Copyright 2020
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

import { Address } from "./model/address";
import {CountryUtil} from '../common/country-util';

export function addressToString(address: Address): string {
    const num = address.buildingNumber ? " " + address.buildingNumber : "";
    const region = address.region ? " (" + address.region + ")" : "";
    return `${address.streetName}${num}, ${address.postalCode} ${address.cityName}${region}, ${CountryUtil.getCountryByISO(address.country)}`;
}
