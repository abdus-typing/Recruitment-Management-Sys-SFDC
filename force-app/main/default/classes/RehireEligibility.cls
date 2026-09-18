public class RehireEligibility implements Database.Batchable<sObject> {
    public Database.QueryLocator start(Database.BatchableContext bc) {
        Date cutoff = Date.today().addMonths(-6);
        return Database.getQueryLocator([ SELECT Id, Eligible_for_Rehire__c FROM Candidate__c WHERE Application_Status__c = 'Rejected' AND Eligible_for_Rehire__c = false AND Rejected_Date__c <= :cutoff ]);
    } 
    public void execute(Database.BatchableContext bc, List<Candidate__c> scope) {
        for (Candidate__c c : scope) { c.Eligible_for_Rehire__c = true;
        }
    Database.update(scope, false); 
    }
    public void finish(Database.BatchableContext bc) { } 
}