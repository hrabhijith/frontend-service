/**
 * Created by suat on 12-May-17.
 */

import {Component, OnInit} from "@angular/core";
import {ActivatedRoute, Params, Router} from "@angular/router";
import {Category} from "../model/category/category";
import {CategoryService} from "./category.service";
import {CookieService} from "ng2-cookies";
import {CatalogueService} from "../catalogue.service";
import {PublishService} from "../publish-and-aip.service";
import {ProductPublishComponent} from "../publish/product-publish.component";
import {UBLModelUtils} from "../model/ubl-model-utils";
import {CallStatus} from '../../common/call-status';
import {sanitizeDataTypeName} from '../../common/utils';
import {CategoryTreeComponent} from './category-tree.component';
import { ParentCategories } from "../model/category/parent-categories";
import { sortCategories } from "../../common/utils";
import { PropertyValueQualifier } from "../model/publish/property-value-qualifier";
import { Property } from "../model/category/property";
import { AppComponent } from "../../app.component";

@Component({
    selector: 'category-search',
    templateUrl: './category-search.component.html',
    styleUrls: ['./category-search.component.css']
})

export class CategorySearchComponent implements OnInit {
    getCategoryStatus: CallStatus = new CallStatus();

    categories: Category[];
    pageRef: string = null;
    publishingGranularity: string;

    submitted: boolean = false;
    callback: boolean = false;
    error_detc: boolean = false;
    navigating: boolean = false;

    // It checks whether user will return publishing page or not
    isReturnPublish: boolean = false;
    // It checks whether user is publishing or not
    inPublish: boolean = false;

    // keeps the query term
    categoryKeyword: string;

    treeView: boolean = true;
    parentCategories: ParentCategories = null;
    rootCategories: Category[];

    selectedCategory: Category = null;
    selectedCategories: Category[] = [];
    selectedCategoryWithDetails: Category = null;
    selectedCategoriesWRTLevels = [];
    propertyNames: string[] = ["code", "taxonomyId", "level", "definition", "note", "remark"];
    taxonomyId: string = "eClass";

    showBothCategories: boolean = true;
    eClassLogisticsCategory: Category = null;
    logisticsCodes: string[] = ["14", "Logistics"]

    showOtherProperties = null;
    callStatus: CallStatus = new CallStatus();

    constructor(private router: Router,
                private route: ActivatedRoute,
                private cookieService: CookieService,
                public categoryService: CategoryService,
                private catalogueService: CatalogueService,
                private publishService:PublishService,
                public appComponent: AppComponent) {
    }


    ngOnInit(): void {
        this.route.queryParams.subscribe((params: Params) => {

            // current page regs considered: menu, publish, null
            this.pageRef = params['pageRef'];

            // This part is necessary since only the params has changes,canDeactivate method will not be called.
            if(this.inPublish == true && this.pageRef == 'menu'){
                if(!confirm("You will lose any changes you made, are you sure you want to quit ?")){
                    return;
                }
            }

            // If pageRef is 'publish',then user is publishing.
            if(this.pageRef == 'publish'){
                this.inPublish = true;
            }

            if(this.pageRef == null || this.pageRef == 'menu') {
                // reset categories
                this.categoryService.resetSelectedCategories();
                // reset draft catalogue line
                this.publishService.publishingStarted = false;
                this.publishService.publishMode = 'create';
            }

            // publishing granularity: single, bulk, null
            this.publishingGranularity = params['pg'];
            if(this.pageRef == null) {
                this.pageRef = 'single';
            }

            // handle category query term
            this.categoryKeyword = params['cat'];
            if(this.categoryKeyword != null) {
                this.getCategories();
            }
        });
        this.getRootCategories();
    }

    canDeactivate():boolean{

        this.inPublish = false;
        if(this.pageRef == "publish" && this.isReturnPublish == false){
            if(!confirm("You will lose any changes you made, are you sure you want to quit ?")){
                return false;
            }
        }
        return true;
    }

    onSearchCategory(): void {
        this.parentCategories = null;
        this.selectedCategoryWithDetails=null;
        this.treeView = false;
        this.router.navigate(['/catalogue/categorysearch'], {queryParams: {pg: this.publishingGranularity, pageRef: this.pageRef, cat: this.categoryKeyword}});
    }

    toggleTreeView(): void {
        this.treeView = !this.treeView;
    }

    getRootCategories(): any {
        this.callback = false;
        this.submitted = true;
        this.error_detc = false;
        this.getCategoryStatus.submit();
        this.categoryService.getRootCategories(this.taxonomyId).then(rootCategories => {
            this.rootCategories = sortCategories(rootCategories);
            this.getCategoryStatus.callback("Retrieved category details", true);
            this.eClassLogisticsCategory = this.rootCategories.find(c=> c.code==="14000000");
            let searchIndex = this.findCategoryInArray(this.rootCategories, this.eClassLogisticsCategory);
            this.rootCategories.splice(searchIndex, 1);
            this.callback = true;
            this.submitted = false;
        }).catch(error => {
            this.getCategoryStatus.error("Failed to retrieve category details");
            this.error_detc = true;
        });
    }

    displayRootCategories(taxonomyId: string): void {
        this.treeView = true;
        this.taxonomyId = taxonomyId;
        this.getRootCategories();
    }

    private getCategories(): void {

        this.callback = false;
        this.submitted = true;
        this.error_detc = false;

        this.categoryService.getCategoriesByName(this.categoryKeyword)
            .then(categories => {
                this.categories = categories;
                this.callback = true;
                this.submitted = false;
            }).catch( () => {
                this.error_detc = true;
            }
        );
    }

    private selectCategory(category: Category): void {
        // if no category is selected or if the selected category is already selected
        // do nothing
        if (category == null || this.findCategoryInArray(this.categoryService.selectedCategories, category) > -1) {
            return;
        }

        this.callback = false;
        this.submitted = true;
        this.error_detc = false;

        if(this.selectedCategoryWithDetails && category && this.selectedCategoryWithDetails.id == category.id){
            this.categoryService.addSelectedCategory(category);
            this.selectedCategories.push(category);
            this.addLogistics(category);
            this.callback = true;
            this.submitted = false;
            return;
        }

        this.categoryService.getCategory(category)
            .then(category => {
                this.categoryService.addSelectedCategory(category);
                this.selectedCategories.push(category);
                this.addLogistics(category);
                this.callback = true;
                this.submitted = false;
                return;
            }).catch( () => {
                this.error_detc = true;
            }
        );
    }

    private navigateToPublishingPage():void {
        this.navigating = true;
        let userId = this.cookieService.get("user_id");
        this.catalogueService.getCatalogue(userId).then(catalogue => {
            ProductPublishComponent.dialogBox = true;
            // set isReturnPublish in order not to show confirmation popup
            this.isReturnPublish = true;
            this.router.navigate(['catalogue/publish'], {queryParams: {pg: this.publishingGranularity}});
        }).catch(() => {
            this.navigating = false;
            this.error_detc = true;
        });
    }

    private removeCategory(category: Category): void {
        let index = this.findCategoryInArray(this.categoryService.selectedCategories, category);
        if (index > -1) {
            this.categoryService.selectedCategories.splice(index, 1);
            let searchIndex = this.findCategoryInArray(this.selectedCategories, category);
            if(searchIndex > -1) {
                this.selectedCategories.splice(searchIndex, 1);
            }
            this.removeLogistics(category);
        }
    }

    getCategoryTree(category: Category){
        this.selectedCategoryWithDetails = null;
        this.treeView = true;
        this.taxonomyId = category.taxonomyId;
        this.callStatus.submit();
        this.categoryService.getParentCategories(category).then(categories => {

            this.categoryService.getCategory(category)
                .then(category => {
                    this.rootCategories = sortCategories(categories.categories[0]);
                    this.selectedCategoryWithDetails = category;
                    this.selectedCategory = category;
                    this.parentCategories = categories; // parents categories
                    this.selectedCategoriesWRTLevels = [];
                    for(let parent of this.parentCategories.parents){
                        this.selectedCategoriesWRTLevels.push(parent.code);
                    }
                    this.callStatus.callback( null);
                }).catch( err => {
                    this.callStatus.error(null)
                }
            );

        })
            .catch(res=>
                this.callStatus.error(null)
            );
    }

    getCategoryDetails(category: Category) {
        this.callback = false;
        this.submitted = true;
        this.error_detc = false;
        this.selectedCategory = category;
        this.selectedCategoryWithDetails = null;
        this.callStatus.submit();

        this.showOtherProperties = false;
        this.categoryService.getCategory(category)
            .then(category => {
                this.callStatus.callback( "Retrieved details of the category",true);
                this.selectedCategoryWithDetails = category;
                this.callback = true;
                this.submitted = false;
            }).catch( err => {
                this.callStatus.error("Failed to retrieved details of the category");
                this.error_detc = true;
            }
        );
    }

    getCategoryProperty(propName): string {
        return String(this.selectedCategoryWithDetails[propName]);
    }

    getPropertyType(property: Property): string {
        return sanitizeDataTypeName(property.dataType);
    }

    addLogistics(category: Category): void {
        if(category.code.startsWith(this.logisticsCodes[0]) ||
            category.code.startsWith(this.logisticsCodes[1])) {
            this.showBothCategories = false;
            this.publishService.isLogisticsProduct = true;
        } else {
            this.showBothCategories = false;
            this.publishService.isLogisticsProduct = false;
        }
    }

    removeLogistics(category: Category): void {
        if(this.selectedCategories.length === 0) {
            this.showBothCategories = true;
            if(category.code.startsWith(this.logisticsCodes[0]) ||
                category.code.startsWith(this.logisticsCodes[1])) {
                    this.publishService.isLogisticsProduct = false
            }
        }
    }

    isLogistics(): boolean {
        return this.publishService.isLogisticsProduct;
    }

    private findCategoryInArray(categoryArray: Category[], category: Category): number {
        return categoryArray.findIndex(c => c.id == category.id);
    }
}
