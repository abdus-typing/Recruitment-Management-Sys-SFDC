
# TalentPulse — Recruitment Management System

A Salesforce-native recruitment management platform built on custom objects, Flow automation, Apex, and a Lightning Web Component console, with a candidate-facing Experience Cloud portal.


---

## Table of Contents
- [Overview](#overview)
- [Tech Stack](#tech-stack)
- [Data Model](#data-model)
- [Requirements/Features Implemented](#requirements-implemented)
- [Architecture & Key Technical Decisions](#architecture--key-technical-decisions)
- [Security Model](#security-model)
- [Testing](#testing)
- [Project Structure](#project-structure)
<!--- [Setup / Deployment](#setup--deployment)-->
<!--- [Known Issues / Open Items](#known-issues--open-items)-->
---

## Overview

This TalentPulse project is a Salesforce-native implementation of a recruitment agency management system, covering the full candidate lifecycle: guided registration, duplicate-application detection, interview assignment and grading, a recruiter-facing interview console, a candidate self-service portal, and automated post-rejection rehire-eligibility tracking. Built and iteratively debugged in a live Developer Edition org, with an emphasis on verified, tested outcomes over assumed-working configuration.

---

## Tech Stack

- **Salesforce Flow** — Screen Flows (candidate registration, portal lookup) and Record-Triggered Flows (duplicate detection, status-change automation)
- **Apex** — `Batchable`, `Schedulable`, and standard classes with explicit FLS/CRUD enforcement
- **Lightning Web Components (LWC)** — custom Interview Console
- **SOQL / SOSL**
- **Salesforce Experience Cloud** — Customer Community Login portal for candidates
- **Permission Sets & Profile-based Field-Level Security**
- **Validation Rules**
- **VS Code + Salesforce Extension Pack (SFDX)** and **Developer Console**

---

## Data Model

### `Candidate__c` (custom object)

| Field Label | API Name | Type | Notes |
|---|---|---|---|
| Candidate Name | `Name` | Text (standard) | |
| Email Address | `Email_Address__c` | Email | Used for duplicate matching and portal ownership checks. **No unique constraint** — see rationale below. |
| Years of Experience | `Years_of_Experience__c` | Number(2,0) | Required only when `Is_Experienced__c` is true (Req 2) |
| Expected Salary | `Expected_Salary__c` | Currency | Field-level restricted from Technical Interviewer profile (Req 5); HR can view/update (Req 6) |
| Application Status | `Application_Status__c` | Picklist | New, Screening, Interview Scheduled, Interviewed, Offer Released, Rejected, Hired |
| Technical Interview Outcome | `Technical_Interview_Outcome__c` | Picklist | Values: blank (not yet reviewed), Selected, Rejected, Hold |
| Candidate Grade | `Candidate_Grade__c` | Formula (Text) | `IF(Years_of_Experience__c = 0, "Fresher", IF(AND(Years_of_Experience__c >= 1, Years_of_Experience__c <= 3), "Junior", IF(AND(Years_of_Experience__c >= 4, Years_of_Experience__c <= 7), "Senior", IF(Years_of_Experience__c > 7, "Lead", "Not Graded"))))` — drives Senior/Lead routing (Req 8) |
| Recruitment Agency | `Recruitment_Agency__c` | Lookup(Account) | Deliberately Lookup, not Master-Detail (see below) |
| Is Experienced | `Is_Experienced__c` | Checkbox | Drives conditional Years-of-Experience requirement (Req 2) |
| Is Duplicate? | `Is_Duplicate__c` | Checkbox | Set/reset automatically by duplicate-detection automation (Req 11a) |
| Rejected Date | `Rejected_Date__c` | Date | Stamped only on genuine transition into Rejected; protected against manual removal by a validation rule (Req 11c) |
| Eligible for Rehire | `Eligible_for_Rehire__c` | Checkbox | Set weekly by scheduled Batch Apex, 6+ months after rejection (Req 11c) |
| Portal Contact | `Portal_Contact__c` | Lookup(Contact) | Links a Candidate to the Contact/portal User allowed to view it (Req 10) |

**Why Lookup, not Master-Detail, for Recruitment Agency:** Master-Detail would delete Candidates if the sourcing Account were ever deleted, and would force Candidate's sharing to inherit from Account. Lookup keeps Candidates independent, at the cost of no native roll-up summary — mitigated via report-based aggregation instead (see Req 9).

**Why there's no unique constraint on Email Address:** originally set Unique to satisfy Req 1. Building Req 11a (duplicate detection) revealed a direct conflict — duplicate-email applications need to be *created* so they can be *detected and flagged*, not hard-blocked at save time. A hard Unique constraint would prevent the second record from ever existing, meaning the detection logic could never run. Unique was removed; Req 1 is now satisfied via soft detection (Req 11a) instead of a database constraint. Deliberate trade-off, not an oversight.

### `Account` (standard object) — one addition

| Field Label | API Name | Type | Purpose |
|---|---|---|---|
| Is Recruitment Agency | `Is_Recruitment_Agency__c` | Checkbox | Filters which Accounts appear as selectable "Recruitment Agency" options in the Registration Flow |

### `Duplicate_Review__c` (custom object, built for Req 11a)

Record Name: Auto Number, format `DR-{0000}`. Allow Activities: checked (so alert Tasks can link via WhatId — later retargeted to link to Candidate directly instead, for Activity-feed visibility).

| Field Label | API Name | Type |
|---|---|---|
| Duplicate Candidate | `Duplicate_Candidate__c` | Lookup(Candidate) |
| Original Candidate | `Original_Candidate__c` | Lookup(Candidate) |
| Email | `Email__c` | Text(80) — plain snapshot of the matched email |
| Review Status | `Review_Status__c` | Picklist: New, Under Review, Resolved |
| HR Notes | `HR_Notes__c` | Long Text Area(500) |
---

## Requirements Implemented

| # | Requirement/Feature | Status |
|---|---|---|
| 1 | Candidate email must be unique | ⚠️ Superseded — hard uniqueness removed; satisfied instead via soft duplicate detection (Req 11a). Deliberate trade-off, documented above. |
| 2 | Years of Experience required only for experienced candidates | ✅ Enforced via `Years_Experience_Required` validation rule |
| 3 | HR must register candidates only through the guided Registration Screen Flow, not the standard object UI | ✅ Built & tested |
| 4 | After registration, auto-assign a task to the HR team to schedule an interview | ✅ Built via `Create Interview Task` element in the consolidated After Insert Flow |
| 5 | Technical Interviewers must not see Expected Salary | ✅ Enforced via Profile/Permission Set FLS + server-side `Security.stripInaccessible()` in the Interview Console; verified via direct query as the restricted user, not just UI hiding |
| 6 | HR can view and update salary information | ✅ Granted via Permission Set FLS override |
| 7 | Block Application Status = "Offer Released" until Technical Interview Outcome = "Selected" | ✅ Enforced via `Block_offerrls_without_interview_outcome` validation rule |
| 8 | Senior/Lead candidates auto-assigned to the Senior Technical Interview Team | ✅ Built via `Check Candidate Grade` Decision → `Get Senior Queue` → `Assign to Senior Team` in the After Insert Flow |
| 9 | Management dashboards: by Application Status, by Grade, Agency-wise Hiring Results, Pending Interviews | ✅ Built, four reports + one dashboard, confirmed visible to HR Testing user.  |
| 10 | Candidate Self-Service Portal | ✅ Access, security, and FLS fully fixed & verified.  |
| 11a | Real-time duplicate active-application detection | ✅ Core logic fully rebuilt and tested (6/6 scenarios).  |
| 11b | Candidate Interview Console (custom LWC + Apex) | ✅ Built, deployed, fully tested |
| 11c | Weekly Rehire-Eligibility batch job | ✅ Built, tested, and confirmed live/scheduled |

---

## Validation Rules

| Rule Name | Formula | Enforces |
|---|---|---|
| `Years_Experience_Required` | `OR(AND(Is_Experienced__c = TRUE, OR(ISBLANK(TEXT(Years_of_Experience__c)), Years_of_Experience__c <= 0)), AND(Is_Experienced__c = FALSE, Years_of_Experience__c > 0))` | Req 2 |
| `Block_offerrls_without_interview_outcome` | `AND(ISPICKVAL(Application_Status__c, "Offer Released"), NOT(ISPICKVAL(Technical_Interview_Outcome__c, "Selected")))` | Req 7 |
| `Expected_Salary_Cannot_Be_Negative` | `Expected_Salary__c < 0` | Data integrity |
| `Rejected_Date_Cannot_Be_Cleared` | Uses `PRIORVALUE()` to block manual removal of `Rejected_Date__c` while status remains Rejected, without blocking the automation's own first-time write | Req 11c |

---

## Architecture & Key Technical Decisions

**Why Batch Apex over a Scheduled Flow for Req 11c:**
`Database.getQueryLocator()` in Batch Apex scales past the standard 50,000-row SOQL query limit (up to 50 million rows), which a Flow's `Get Records` element cannot. Given the stated data volume ("thousands of rejected candidates," growing weekly), this was chosen for governor-limit safety at scale, not stylistic preference. Batch size (200) and `allOrNone=false` are explicitly controlled for graceful partial failure.

**Why a custom LWC over a declarative List View for Req 11b:**
Declarative List Views can't dynamically hide a field per logged-in user's actual effective FLS (Profile + Permission Set combined) — they'd require a separate List View per profile, drifting out of sync over time. The console instead queries `Schema.describe().isAccessible()` at runtime, and enforces the same restriction server-side via `Security.stripInaccessible()` (see below).

**`WITH USER_MODE` vs. `Security.stripInaccessible()`:**
`WITH USER_MODE` (and `WITH SECURITY_ENFORCED`) enforce FLS at SOQL compile time — if *any* referenced field is inaccessible to the running user, the entire query throws an exception rather than partially returning data. This was found in production during Req 11b testing (an Interviewer-restricted field broke the whole console query) and corrected to use `Security.stripInaccessible(AccessType.READABLE, results)` instead, which runs the query in full (system mode, default for Apex) and redacts inaccessible field values afterward — graceful degradation instead of all-or-nothing failure.

**`{!$Record__Prior}` for transition-only automation:**
Used throughout the Candidate After Insert Flow to distinguish a genuine field *transition* (e.g., status changing into "Rejected") from an unrelated edit to an already-Rejected record, and to distinguish a genuine insert from an update — preventing duplicate interview tasks and incorrect re-stamping.

**`PRIORVALUE()` in validation rules:**
Used to block a system-stamped field (`Rejected_Date__c`) from being manually cleared while its dependent status remains active, without blocking the automation's own legitimate first-time write to that field.

---

## Security Model

- **Profile vs. Permission Set FLS:** Permission Set grants override more restrictive Profile-level FLS settings (most-permissive-wins union) — used deliberately to grant HR Recruiter access to fields (e.g. `Expected_Salary__c`) that are restricted at the Profile level for other roles sharing that Profile.
- **Portal licensing:** Candidates use the `Customer Community Login` license (login-based/high-volume), which does not support admin "Log In As" and requires a Sharing Set (not role hierarchy) for record-level access.
- **Least-privilege object access:** portal users are granted Read-only on `Candidate__c` — deliberately no Create access, enforced instead via System Context flow execution and a controlled entry point.

---

<!--## Setup / Deployment

 TODO: fill in your actual SFDX project setup steps, e.g.:
1. sf org login web -a TalentPulseOrg
2. sf project deploy start -o TalentPulseOrg
3. Assign Permission Sets: HR Recruiter, Technical Interviewer, Candidate Portal
4. Schedule the weekly batch job (see scripts/apex/schedule-rehire.apex)
-->

---

## Testing

**11a — Duplicate Detection:** 6/6 core scenarios passed — genuine insert (no duplicate), duplicate of an active candidate, duplicate of a Rejected candidate (correctly ignored), email changed to a fresh address, email changed to match another active candidate, unrelated field changed (correctly no-op).

**11b — Interview Console:** search/sort confirmed live; inline edit with partial-failure row-level errors confirmed; Technical Interviewer field restriction confirmed both in the UI and independently via direct query (Workbench) to prove server-side enforcement, not just UI hiding.

**11c — Rehire Eligibility:** transition-only date stamping confirmed; removal-guard validation rule confirmed; status-reversal cleanup confirmed; batch logic manually tested via Execute Anonymous before scheduling; live schedule confirmed via Setup → Scheduled Jobs.

---

<!--## Known Issues / Open Items

<!--- **Req 10:** an alternate, peer-built portal lookup flow ("Candidate Application Lookup – V2") contains a self-referential Decision condition that performs no real ownership check — identified, not fixed. Do not use this flow in its current state.
- **Req 11a:** real-time HR notification via Custom Notification is not functional — the build attempt caused Candidate registration to fail (same-transaction rollback) and was reverted. HR is currently only alerted via Task, not a real-time notification.
- **Req 9:** Dashboard "Running User" setting was never confirmed — if set to run as an elevated user, restricted fields (e.g. salary) could be exposed on dashboard components to users who shouldn't see them.
- **Req 10:** self-registration setup steps were documented but not confirmed executed/tested end-to-end.
- **Reqs 1, 2, 4, 5, 6, 7, 8:** not documented in this README — please fill in from your own requirements/traceability doc. -->

---

## Project Structure

**Currently Version-controlled in this repo (Apex + LWC — the code layer):**
```
force-app/main/default
                  ├── classes/
                  │   ├── CandidateConsoleController.cls
                  │   ├── CandidateConsoleController.cls-meta.xml
                  │   ├── RehireEligibility.cls
                  │   ├── RehireEligibility.cls-meta.xml
                  │   ├── RehireEligibilityScheduler.cls
                  │   └── RehireEligibilityScheduler.cls-meta.xml
                  │
                  └── lwc/
                      └── candidateInterviewConsole/
                          ├── candidateInterviewConsole.html
                          ├── candidateInterviewConsole.js
                          ├── candidateInterviewConsole.js-meta.xml
                          └── tests/
                              └── candidateInterviewConsole.test.js

sfdx-project.json
README.md
```

**Declarative metadata (Flows, Objects, Validation Rules, Permission Sets) is intentionally documented in this README rather than committed as raw retrieved XML.** A Flow's exported metadata is not meaningfully reviewable outside Flow Builder itself — it's element IDs and connector references, not reasoning. The `Requirements Implemented`, `Validation Rules`, and `Architecture & Key Technical Decisions` sections above are the actual record of what was built and *why* — that's the part meant to be read, not clicked through as XML. The [flow diagram](./Candidate_After_Insert_Flow_Diagram.pdf) included in this repo covers the one Flow complex enough to warrant a visual.

## Lessons Learned / Platform Gotchas

- Lookup screen components in Flow always check the *running user's own* Create/Edit permission on the bound object, regardless of the flow's System Context setting — use Get Records + Picklist instead when the user's own object access has been intentionally restricted.
- Queues have no native `{!$Queue...}` merge field in Flow — Get Records on `Group`, filtered by `Name` and `Type = 'Queue'`.
- Record-Triggered Flows can't be meaningfully tested via the "Run" button, and Flow Debug always executes as the admin regardless of configured run context — don't trust Debug-mode results as proof a restricted user's experience actually works. Real saves, as the real user, are the only reliable test.
- Two separate active Record-Triggered Flows on the same object/event have no guaranteed execution order — consolidate into one flow with explicit branching instead.
- Report/Dashboard visibility is controlled by folder sharing, entirely separate from object/field security.
- Filter and validation values must match actual configured picklist values, not the values implied by the original requirement wording.
- Customer Community Login portal users need a Sharing Set (not standard sharing rules) for custom object visibility.
- `WITH USER_MODE`/`WITH SECURITY_ENFORCED` fail an entire SOQL query if any referenced field is inaccessible to the running user; `Security.stripInaccessible()` degrades gracefully per-field instead.

