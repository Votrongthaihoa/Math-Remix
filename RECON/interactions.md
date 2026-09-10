# Interaction inventory

## Verified in target recon or local smoke

- App sidebar expands and collapses without navigation or page reload.
- Expanded-to-collapsed geometry animates across sidebar, toggle and main offset.
- Collapsed navigation icons show a tooltip on hover.
- User dropdown opens from the username and exposes account/logout items.
- Dashboard navigation opens courses; a visible course action opens a read-only study detail and browser Back returns to courses.
- Courses navigate to history, and history navigates to timetable.
- The account-menu account action opens successfully; logout was deliberately untouched.
- Dashboard `Xem tất cả` opens `/exam-rooms/hsa`; no runner, answers, submission, result, review, or solution flow was opened.
- Public landing page has teacher carousel previous/next controls and course-rail previous/next controls.
- Local study drawer opens only at 1024-1199px, traps focus, locks the body and restores focus on close.
- Local study curriculum becomes inline at <=1023px; previous/next lesson navigation is visible on desktop and hidden in inline/phone layouts.
- Local lesson flow switches video/PDF resources, handles a mocked 503 retry and preserves the lesson context.
- Local student schedule week navigation and scrollable week-grid behavior are covered by smoke.

## Pending live-target evidence

- Public mobile menu and learning-space dropdown.
- Sidebar group/flyout exact click-versus-hover behavior in collapsed mode.
- Deeper lesson resource interactions beyond entering the read-only study detail.
- Live modal, form, validation, loading, empty and error states.
- Exam interactions (read-only/non-submitting recon only).
- Profile form mutation and schedule editing flows.

Observed ambiguity: the HSA submenu activation from `/tkb` did not transition, although the dashboard route to the same catalog worked.
