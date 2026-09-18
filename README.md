
# TalentPulse — Recruitment Management System

A Salesforce-native recruitment management platform built on custom objects, Flow automation, Apex, and a Lightning Web Component console, with a candidate-facing Experience Cloud portal.

> **Status:** Requirements 1–9 and 11d are noted below at whatever level of detail is available; Requirements 10, 11a, 11b, and 11c are fully documented, built, and tested. See [Known Issues / Open Items](#known-issues--open-items) for what's genuinely still incomplete — nothing below is overstated as "done" unless it was actually verified.

---

## Table of Contents
- [Overview](#overview)
- [Tech Stack](#tech-stack)
- [Data Model](#data-model)
- [Requirements Implemented](#requirements-implemented)
- [Architecture & Key Technical Decisions](#architecture--key-technical-decisions)
- [Security Model](#security-model)
- [Setup / Deployment](#setup--deployment)
- [Testing](#testing)
- [Known Issues / Open Items](#known-issues--open-items)
- [Project Structure](#project-structure)

---

## Overview

<!-- TODO: 2-4 sentence description of what TalentPulse does and who it's for
     (e.g. internal HR tool for tracking candidates through the hiring pipeline,
     with a self-service portal for candidates to check application status). -->

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

| Object | Purpose |
|---|---|
| `Candidate__c` | Core object tracking a candidate's application, status, grade, interview outcome, and rehire eligibility |
| `Duplicate_Review__c` | Created when a duplicate email match is detected on `Candidate__c` |
| `Account` | <!-- TODO: describe how Account was extended/used for this project --> |

**Key fields on `Candidate__c`:**

| Field | Type | Purpose |
|---|---|---|
| `Email_Address__c` | Email | Used for duplicate matching and portal ownership checks |
| `Application_Status__c` | Picklist | New, Screening, Interview Scheduled, Interviewed, Offer Released, Rejected, Hired |
| `Candidate_Grade__c` | Picklist | Used to route interview assignment (Senior/Lead vs. HR team) |
| `Technical_Interview_Outcome__c` | Picklist/Text | Editable via the Interview Console |
| `Expected_Salary__c` | Currency | Field-level restricted from Technical Interviewer profile |
| `Is_Duplicate__c` | Checkbox | Set/reset automatically by duplicate-detection automation |
| `Rejected_Date__c` | Date | Stamped only on genuine transition into Rejected status; protected by a validation rule against manual removal |
| `Eligible_for_Rehire__c` | Checkbox | Set weekly by scheduled Batch Apex, 6+ months after rejection |
| `Portal_Contact__c` | Lookup(Contact) | Links a candidate record to the Contact/User used for portal login |

---

## Requirements Implemented

| # | Requirement | Status |
|---|---|---|
| 1 | <!-- TODO --> | <!-- TODO --> |
| 2 | <!-- TODO --> | <!-- TODO --> |
| 3 | Candidate Registration Flow — self-service registration Screen Flow. Create access deliberately removed from the running profile; flow enforces via System Context execution and a custom list button rather than direct object-level Create permission. | ✅ Built & tested |
| 4 | <!-- TODO: partially handled inside the consolidated "Candidate After Insert Flow" — exact spec not documented here, please fill in --> | ⚠️ Undocumented |
| 5 | <!-- TODO --> | <!-- TODO --> |
| 6 | <!-- TODO --> | <!-- TODO --> |
| 7 | <!-- TODO --> | <!-- TODO --> |
| 8 | <!-- TODO: partially handled inside the consolidated "Candidate After Insert Flow" — exact spec not documented here, please fill in --> | ⚠️ Undocumented |
| 9 | Reports + Dashboard, confirmed visible to HR Testing user | ✅ Built; ⚠️ Dashboard "Running User" setting never confirmed (possible salary data exposure risk — see Open Items) |
| 10 | Candidate Self-Service Portal (Experience Cloud, Customer Community Login) | ✅ Access, security, and FLS fully fixed & verified. ⚠️ One security bug found in an alternate peer-built flow, documented but not fixed. Self-registration setup steps provided, not confirmed executed. |
| 11a | Real-time duplicate candidate detection | ✅ Core logic fully rebuilt and tested (6/6 core test scenarios passing). ⚠️ Real-time HR notification (Custom Notification) built, broke registration due to a same-transaction rollback, reverted — not resolved. |
| 11b | Candidate Interview Console (custom LWC + Apex) | ✅ Built, deployed, and fully tested — search, sort, inline edit with partial-failure handling, and role-based field visibility all confirmed. |
| 11c | Weekly Rehire-Eligibility batch job | ✅ Built, tested, and confirmed live and scheduled (Batch Apex + Schedulable Apex). |
| 11d | (Requirement referenced loan/lending domain terms — "outstanding loan exposure," "senior underwriters" — with no matching picklist values on this object) | ❌ Identified as a mismatched/misattached requirement and deliberately excluded, confirmed as a mistake by the requester |

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

## Setup / Deployment

<!-- TODO: fill in your actual SFDX project setup steps, e.g.:
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

## Known Issues / Open Items

- **Req 10:** an alternate, peer-built portal lookup flow ("Candidate Application Lookup – V2") contains a self-referential Decision condition that performs no real ownership check — identified, not fixed. Do not use this flow in its current state.
- **Req 11a:** real-time HR notification via Custom Notification is not functional — the build attempt caused Candidate registration to fail (same-transaction rollback) and was reverted. HR is currently only alerted via Task, not a real-time notification.
- **Req 9:** Dashboard "Running User" setting was never confirmed — if set to run as an elevated user, restricted fields (e.g. salary) could be exposed on dashboard components to users who shouldn't see them.
- **Req 10:** self-registration setup steps were documented but not confirmed executed/tested end-to-end.
- **Reqs 1, 2, 4, 5, 6, 7, 8:** not documented in this README — please fill in from your own requirements/traceability doc.

---

## Project Structure

<!-- TODO: adjust to your actual SFDX folder layout, e.g.:
force-app/main/default/
├── classes/              # CandidateConsoleController, RehireEligibility, RehireEligibilityScheduler
├── flows/                # Candidate_Registration_Flow, Candidate_After_Insert_Flow
├── lwc/                  # candidateInterviewConsole
├── objects/              # Candidate__c, Duplicate_Review__c
└── permissionsets/        # HR Recruiter, Technical Interviewer, Candidate Portal
scripts/apex/
└── schedule-rehire.apex   # one-time script to schedule the weekly batch job
-->


# Salesforce DX Project

Salesforce DX is a development approach that brings source-driven development, team collaboration, and continuous integration to the Salesforce Platform. Instead of working directly in an org through a web browser, you work with metadata as source files in a local DX project, track changes in version control, and deploy through automated processes.

This project template gets you started with the tools and structure you need to build Salesforce applications using source control, scratch orgs, and the Salesforce CLI.

## Prerequisites

Before you start, make sure you have:

- **Salesforce CLI** - Download from [developer.salesforce.com/tools/salesforcecli](https://developer.salesforce.com/tools/salesforcecli). See [Install Salesforce CLI](https://developer.salesforce.com/docs/atlas.en-us.sfdx_setup.meta/sfdx_setup/sfdx_setup_install_cli.htm) for details.
- **VS Code with Salesforce Extension Pack** - See [Installation Instructions](https://developer.salesforce.com/docs/platform/sfvscode-extensions/guide/install.html) for details. Includes the Agentforce Vibes extension.
- **A development org** - Sign up for a free Developer Edition org [here](https://developer.salesforce.com/signup).
- **Dev Hub enabled** (optional, required to create scratch orgs) - You can enable Dev Hub in your development org under Setup > Dev Hub.  See [Provide Developers Access to Salesforce DX Tools](https://developer.salesforce.com/docs/atlas.en-us.sfdx_dev.meta/sfdx_dev/sfdx_setup_dx_tools.htm).

## Project Structure

Your DX project follows this structure:

- **`force-app/main/default/`** - Your metadata source files live in this default package directory. You can configure additional package directories in the `sfdx-project.json` file.
- **`config/`** - Scratch org definitions and project settings
- **`scripts/`** - Automation scripts for common tasks
- **`sfdx-project.json`** - Project manifest that defines package directories, namespace, API version, and other project-level settings

See [Salesforce DX Project Configuration](https://developer.salesforce.com/docs/atlas.en-us.sfdx_dev.meta/sfdx_dev/sfdx_dev_ws_config.htm).

## Get Started

Ready to start developing? The [Get Started with Salesforce DX](https://developer.salesforce.com/docs/atlas.en-us.sfdx_dev.meta/sfdx_dev/sfdx_dev_get_started_dx.htm) guide walks you through your first project, from creating a scratch org to creating a simple Apex class or LWC to deploying your code to a sandbox.

## Common Salesforce CLI Commands

Here are common CLI commands that you'll use the most:

- `sf org login web`: Authorize an org
- `sf org open`: Open your org in a browser
- `sf org create scratch`: Create a scratch org
- `sf project deploy start`: Deploy metadata to your org
- `sf project retrieve start`: Retrieve metadata from your org
- `sf template generate <artifact>`: Scaffold new components, such as Apex classes and triggers, LWC components, Lightning apps, and more
- `sf apex <command>`: Run Apex tests, run anonymous Apex blocks, and view logs
- `sf data <command>`: Work with test data
- `sf alias <command>`: Manage org aliases
- `sf config <command>`: Configure CLI settings

## Use Agentforce Vibes to Build Lightning Apps

Transform your ideas into custom Lightning apps that extend CRM workflows directly in Lightning Experience. Through natural conversations with Agentforce Vibes, implement custom objects and fields, complex business logic, and dynamic UI components. See [Build a Lightning App Using Agentforce Vibes](https://developer.salesforce.com/docs/platform/einstein-for-devs/guide/lexapp-overview.html).

## Additional Resources

- [Agentforce Vibes Developer Guide](https://developer.salesforce.com/docs/platform/einstein-for-devs/guide/einstein-overview.html)
- [Salesforce CLI Installation Guide](https://developer.salesforce.com/docs/atlas.en-us.sfdx_setup.meta/sfdx_setup/sfdx_setup_intro.htm)
- [Salesforce DX Developer Guide](https://developer.salesforce.com/docs/atlas.en-us.sfdx_dev.meta/sfdx_dev/)
- [Salesforce CLI Command Reference](https://developer.salesforce.com/docs/atlas.en-us.sfdx_cli_reference.meta/sfdx_cli_reference/)
- [Salesforce CLI Plugin Development Guide](https://developer.salesforce.com/docs/platform/salesforce-cli-plugin/guide/conceptual-overview.html)
- [Salesforce VS Code Extensions Documentation](https://developer.salesforce.com/tools/vscode/)

