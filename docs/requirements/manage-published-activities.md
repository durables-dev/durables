# Business requirements: Managing published activities

_Business-requirements document for the increment after the Durables MVP. Drafted by Claude in a session with David Dieruf (PM, designer and operator) on 2026-11-16; every decision below is his. It follows [Business requirements: Durables MVP](https://linear.app/kisasa/document/business-requirements-durables-mvp-e2329a1355a3), whose capability-row numbers it keeps, and takes up rows that document left `out`._

## Business problem

Once an activity is published, its publisher can only change its one-line description. They can't publish a fix as a new version, warn people off a version that is broken, take an activity out of search, or delete their account. Durables' Privacy page already offers account deletion, but only as a request sent by email.

Publishers also can't get back to their activities. The only way to sign in is to start contributing, and signing in always lands in the Contribute flow. There is no list of a publisher's own activities, so managing one means finding it through search and arriving already signed in.

## Affected users

- **Publisher:** a developer who has published activities and needs to fix, retire, hide or stop sharing them.
- **Activity consumer:** a developer using a published activity, who needs to know when a version is deprecated and what replaces it.
- **Former publisher:** someone who deleted their account and either wants it back or wants to start again.
- **Operator:** David Dieruf, answerable for the Privacy page's promises about deletion.

## Desired outcome

A publisher signs in from any page and lands back where they were. From their profile they see all their activities, and from an activity's page they can:

- publish a new version,
- deprecate a version and point people to its replacement,
- take the activity out of search and bring it back.

They can delete their account, and restore it within 30 days by signing in. Consumers see deprecation and removal plainly on each version's page.

## Evidence inventory

| Item                                                                                                                                     | What it shows                                                                                                                                                                                                   | Role                                                |
| ---------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------- |
| [Live design canvas](https://claude.ai/artifact/27fKXJqvdpWH9otPxtPFty): `ActivityPage.dc.html`, `Contribute.dc.html`, `Profile.dc.html` | Publisher bar with Update, Deprecate, Create new version and Remove; the Deprecate, Remove and Create a new version dialogs; the new-version mode of the Contribute flow; the profile and Delete account dialog | Target state, except where a decision below differs |
| Board sources on [DUR-1](https://linear.app/kisasa/issue/DUR-1)                                                                          | The same Activity page and Contribute sources. `Profile.dc.html` is not attached there                                                                                                                          | Reference                                           |
| [Business requirements: Durables MVP](https://linear.app/kisasa/document/business-requirements-durables-mvp-e2329a1355a3)                | Rows 13, 28, 30, 31, 32, 33 and 34, all `out` of the MVP                                                                                                                                                        | Source of the capability rows                       |
| [DUR-4](https://linear.app/kisasa/issue/DUR-4) and [DUR-9](https://linear.app/kisasa/issue/DUR-9)                                        | What the MVP's sign-in and Update epics left out                                                                                                                                                                | Scope history                                       |
| [ADR 0015](../adr/0015-removal-deprecation-and-account-deletion.md)                                                                      | How removal, deprecation and account deletion are stored and finalized                                                                                                                                          | Constraint source                                   |

## Business context

- Durables is a free community site, so running costs must stay low.
- Published versions never change, and handles are permanent and never reissued (ADR 0007).
- There are no Durables passwords. A publisher signs in with GitHub, GitLab, Google or Microsoft.
- An account is created only when its first activity is published (ADR 0007).
- The site is live, and publishers have activities they can't manage yet.

## Capability map

Rows keep their MVP numbers. Row 42 is new. All decisions were made by David Dieruf on 2026-11-16.

| \#  | Capability                                        | Explanation                                                                                          | Status     | Decision note                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| --- | ------------------------------------------------- | ---------------------------------------------------------------------------------------------------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 13  | Be warned about deprecated versions               | See why a version is deprecated and go to its replacement                                            | `in-scope` | Shown on the deprecated version's page and in its version list. The Workflow Builder's warning waits for the Builder (row 14)                                                                                                                                                                                                                                                                                                                                             |
| 28  | Publish a new version                             | Start from an earlier version, provide new code, get a suggested version number                      | `in-scope` | As the canvas shows: start from any version; title, description and README text are carried over and the code starts blank; the number must be higher than the latest; a major version is suggested when the activity name, input type or output type changed, otherwise a minor one. A required **What changed** note, up to 160 characters, is added on the Details step and can't be changed after publishing. The first version shows "First release." without asking |
| 28a | Offer to deprecate the version a new one replaces | When publishing a new version, choose to deprecate the version it was started from                   | `in-scope` | Added. An unchecked "Deprecate {base version}" checkbox on the Review step. When checked, the reason starts as "Replaced by {new version}" and can be edited, and the replacement is fixed to the new version. It names the version started from, not the previous latest                                                                                                                                                                                                 |
| 30  | Deprecate a version                               | Mark one version deprecated with a reason and a replacement, or undo it                              | `in-scope` | As the canvas shows: a required reason, and **Point people to** another version of the same activity or **No replacement**. Undo removes it                                                                                                                                                                                                                                                                                                                               |
| 31  | Remove an activity from search                    | Take an activity out of search while its pages keep working, and bring it back                       | `in-scope` | Covers every version. Left out of search, browse, search by publisher and the sitemap, and marked not to be indexed. "Removed by the publisher" shows on every version's page. Update and Deprecate still work while removed. The name stays taken. **Return to search** brings it back, and so does publishing a new version, with a note on the Review step saying so                                                                                                   |
| 32  | View a profile                                    | See the handle, what was kept from the sign-in provider, organizations, and all published activities | `in-scope` | At `/profile`, seen only by its owner. Handle, provider details, and the publisher's activities with All, Listed and Removed filters. Organizations wait for row 19                                                                                                                                                                                                                                                                                                       |
| 33  | Add a backup sign-in                              | Add a second provider to recover the account                                                         | `out`      | Deferred to a later increment                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| 34  | Delete an account                                 | Remove activities from search, delete provider details, retire the handle                            | `in-scope` | The canvas dialog, confirmed by typing the handle. The deletion waits 30 days: signing in again with the same provider account in that time offers **Restore** or **Start as a new user**. Restore brings back only the activities that were listed when the account was deleted. After 30 days the deletion is final                                                                                                                                                     |
| 42  | Sign in to manage                                 | Sign in from any page and return to it                                                               | `in-scope` | New. **Sign in** sits left of **Contribute** in the header when signed out, and is hidden on Contribute pages. It opens a page with the four providers, not the Contribute flow. Afterward the publisher lands back on the page they started from; someone with no account goes into Contribute. Signing out stays on the current page, except on the profile, which goes home. The initials menu holds **Your profile** and **Sign out**                                 |

## Scope boundary

**In:** rows 13, 28, 28a, 30, 31, 32, 34 and 42, as decided above.

**Out, for a later increment:**

- Backup sign-in (row 33).
- Organizations on the profile, which arrive with linking files (row 19).
- Removal of reported listings by Durables (row 38). This increment records who removed a listing so that it can be added without a change to the data (ADR 0015).
- The Workflow Builder's deprecation warning, which arrives with the Builder (row 14).
- "When to use it", category and icon in the Update dialog.

**Named so nobody assumes otherwise:**

- A removed activity's pages and addresses keep working. Removal hides it from search; it never deletes anything.
- Nothing published is ever deleted, including when an account is deleted.
- A handle is never freed. A deleted account's handle is retired, and the provider account can start again only under a new handle.
- A public page per publisher, at `/<handle>`, is not part of this increment. Consumers keep finding a publisher's work through "Search all activities by {handle}".

## Definition of done

The increment is done when a publisher can sign in from any page, find all their activities on their profile, publish a new version, deprecate a version, take an activity out of search and bring it back, and delete their account and restore it within 30 days. Consumers must see deprecation and removal on every version's page, and the Privacy page must describe the grace period.

## Design order of work

Not recorded.
