public with sharing class CandidateConsoleController {

    /**
     * Structured result for a single record's update attempt.
     * Returned instead of raw Database.SaveResult (which serializes
     * inconsistently to LWC) and shaped so lightning-datatable's
     * errors property can highlight the exact failed row.
     */

    public class UpdateResult {
        @AuraEnabled public Id recordId;
        @AuraEnabled public Boolean success;
        @AuraEnabled public String errorMessage;

        public UpdateResult(Id recordId, Boolean success, String errorMessage) {
            this.recordId = recordId;
            this.success = success;
            this.errorMessage = errorMessage;
        }
    }

    /**
     * Returns candidates matching the search term (by Name or Email),
     * ordered by Grade. WITH USER_MODE enforces object/field-level
     * security and sharing rules server-side, based on the running
     * user's actual permissions — so Expected_Salary__c is silently
     * omitted for a user without read access to that field.
     */
@AuraEnabled(cacheable=true)
public static List<Candidate__c> getCandidates(String searchTerm) {
    List<Candidate__c> results;

    if (String.isBlank(searchTerm)) {
        results = [
            SELECT Id, Name, Email_Address__c, Years_of_Experience__c,
                   Candidate_Grade__c, Technical_Interview_Outcome__c
            FROM Candidate__c
            ORDER BY Candidate_Grade__c ASC NULLS LAST
            LIMIT 200
        ];
    } else {
        String searchKey = '%' + searchTerm + '%';
        results = [
            SELECT Id, Name, Email_Address__c, Years_of_Experience__c,
                   Candidate_Grade__c, Technical_Interview_Outcome__c
            FROM Candidate__c
            WHERE Name LIKE :searchKey
               OR Email_Address__c LIKE :searchKey
            ORDER BY Candidate_Grade__c ASC NULLS LAST
            LIMIT 200
        ];
    }

    return (List<Candidate__c>) Security.stripInaccessible(AccessType.READABLE, results).getRecords();
}
    /**
     * Bulk-updates candidates from inline datatable edits.
     * allOrNone = false so partial failures don't block the whole
     * batch. AccessLevel.USER_MODE enforces FLS/CRUD on the write
     * side too — a field the user can't edit will fail per-row here,
     * not silently succeed the way plain Database.update() would.
     */
    @AuraEnabled(cacheable=false)
    public static List<UpdateResult> updateCandidates(List<Candidate__c> records) {
        List<UpdateResult> resultList = new List<UpdateResult>();

        List<Database.SaveResult> saveResults =
            Database.update(records, false, AccessLevel.USER_MODE);

        for (Integer i = 0; i < saveResults.size(); i++) {
            Database.SaveResult sr = saveResults[i];
            if (sr.isSuccess()) {
                resultList.add(new UpdateResult(records[i].Id, true, null));
            } else {
                List<String> msgs = new List<String>();
                for (Database.Error err : sr.getErrors()) {
                    msgs.add(err.getMessage());
                }
                resultList.add(
                    new UpdateResult(records[i].Id, false, String.join(msgs, '; '))
                );
            }
        }
        return resultList;
    }

    /**
     * Self-verifying salary visibility check: reflects whatever FLS
     * is actually configured via Profile/Permission Set for the
     * running user. No custom permission to keep in sync manually —
     * if a new Interviewer-type profile is added later and its FLS
     * is set correctly, this just works without a code change.
     */
    @AuraEnabled(cacheable=true) 
    public static Boolean canViewSalary() {
         Schema.DescribeFieldResult salaryFieldDescribe = Candidate__c.Expected_Salary__c.getDescribe(); 
        return salaryFieldDescribe.isAccessible(); }
}