import { LightningElement, track } from 'lwc';
import { ShowToastEvent } from 'lightning/platformShowToastEvent';
import getCandidates from '@salesforce/apex/CandidateConsoleController.getCandidates';
import updateCandidates from '@salesforce/apex/CandidateConsoleController.updateCandidates';
import canViewSalary from '@salesforce/apex/CandidateConsoleController.canViewSalary';

// Base columns every profile sees. Salary is added conditionally
// in connectedCallback() based on real FLS (via canViewSalary) —
// Interviewers never receive this column definition at all.
const BASE_COLUMNS = [
    { label: 'Name', fieldName: 'Name', sortable: true },
    { label: 'Email', fieldName: 'Email_Address__c', sortable: true },
    {
        label: 'Years of Experience',
        fieldName: 'Years_of_Experience__c',
        type: 'number',
        sortable: true
    },
    { label: 'Grade', fieldName: 'Candidate_Grade__c', sortable: true },
    {
        label: 'Technical Interview Outcome',
        fieldName: 'Technical_Interview_Outcome__c',
        editable: true,
        sortable: true
    }
];

const SALARY_COLUMN = {
    label: 'Expected Salary',
    fieldName: 'Expected_Salary__c',
    type: 'currency',
    sortable: true
};

const SEARCH_DEBOUNCE_MS = 300;
const EDITABLE_FIELD = 'Technical_Interview_Outcome__c';

export default class CandidateInterviewConsole extends LightningElement {
    @track candidates = [];
    @track columns = BASE_COLUMNS;
    @track draftValues = [];
    @track errors = {};

    searchTerm = '';
    sortedBy = 'Candidate_Grade__c';
    sortedDirection = 'asc';
    isLoading = false;
    searchTimeout;

    connectedCallback() {
        canViewSalary()
            .then((result) => {
                this.columns = result
                    ? [...BASE_COLUMNS, SALARY_COLUMN]
                    : BASE_COLUMNS;
            })
            .catch(() => {
                // Fail closed: if the check itself errors, don't show salary.
                this.columns = BASE_COLUMNS;
            });

        this.loadCandidates();
    }

    loadCandidates() {
        this.isLoading = true;
        getCandidates({ searchTerm: this.searchTerm })
            .then((data) => {
                this.candidates = this.sortData(data, this.sortedBy, this.sortedDirection);
            })
            .catch((error) => {
                this.showToast('Error loading candidates', this.reduceError(error), 'error');
            })
            .finally(() => {
                this.isLoading = false;
            });
    }

    handleSearchChange(event) {
        const value = event.target.value;
        window.clearTimeout(this.searchTimeout);
        this.searchTimeout = window.setTimeout(() => {
            this.searchTerm = value;
            this.loadCandidates();
        }, SEARCH_DEBOUNCE_MS);
    }

    handleSort(event) {
        const { fieldName, sortDirection } = event.detail;
        this.sortedBy = fieldName;
        this.sortedDirection = sortDirection;
        this.candidates = this.sortData(this.candidates, fieldName, sortDirection);
    }

    sortData(data, fieldName, direction) {
        const sorted = [...data];
        const reverse = direction === 'asc' ? 1 : -1;

        sorted.sort((a, b) => {
            let valA = a[fieldName];
            let valB = b[fieldName];
            valA = valA === undefined || valA === null ? '' : valA;
            valB = valB === undefined || valB === null ? '' : valB;
            if (typeof valA === 'string') valA = valA.toLowerCase();
            if (typeof valB === 'string') valB = valB.toLowerCase();

            if (valA > valB) return 1 * reverse;
            if (valA < valB) return -1 * reverse;
            return 0;
        });

        return sorted;
    }

    handleSave(event) {
        const draftValues = event.detail.draftValues;

        updateCandidates({ records: draftValues })
            .then((results) => {
                const rowErrors = {};
                let hasErrors = false;

                results.forEach((result) => {
                    if (!result.success) {
                        hasErrors = true;
                        rowErrors[result.recordId] = {
                            title: 'Update failed',
                            messages: [result.errorMessage],
                            fieldNames: [EDITABLE_FIELD]
                        };
                    }
                });

                if (hasErrors) {
                    this.errors = {
                        rows: rowErrors,
                        table: {
                            title: 'Some rows could not be saved',
                            messages: []
                        }
                    };
                    this.showToast(
                        'Some updates failed',
                        'See the highlighted row(s) for details.',
                        'warning'
                    );
                    // Deliberately keep draftValues so the failed
                    // row's edit isn't silently lost from the UI.
                } else {
                    this.errors = {};
                    this.draftValues = [];
                    this.showToast('Success', 'Candidate records updated.', 'success');
                }

                this.loadCandidates();
            })
            .catch((error) => {
                this.showToast('Error saving changes', this.reduceError(error), 'error');
            });
    }

    showToast(title, message, variant) {
        this.dispatchEvent(new ShowToastEvent({ title, message, variant }));
    }

    reduceError(error) {
        if (error && error.body && error.body.message) {
            return error.body.message;
        }
        return 'An unknown error occurred.';
    }
}