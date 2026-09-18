public class RehireEligibilityScheduler implements Schedulable {
    public void execute(SchedulableContext sc) {
        Database.executeBatch(new RehireEligibility(), 200); 
    }
}
// apex... System.schedule('Weekly Rehire Eligibility', '0 0 2 ? * MON', new RehireEligibilityScheduler());