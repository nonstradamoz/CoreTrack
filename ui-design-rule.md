# 1. CORE DESIGN PHILOSOPHY

Every screen in the application must follow these principles.

### 1.1 Minimalism
- Use clean layouts with intentional whitespace.
- Avoid unnecessary decorative elements.
- Avoid excessive shadows, gradients and borders.
- Every visible element must serve a functional purpose.
- Prioritize information over decoration.

### 1.2 Consistency
- Maintain consistent spacing, typography, colours and component behaviour.
- Reuse established components.
- Never introduce a different design language for individual modules.
- Follow the same interaction patterns throughout the application.

### 1.3 Productivity First
- Minimize the number of interactions required to complete common tasks.
- Keep important actions accessible.
- Use inline actions where appropriate.
- Make information easy to scan.
- Support keyboard navigation and shortcuts where applicable.

### 1.4 Enterprise Readiness
- Design for multiple organizations, teams, departments and permission levels.
- Support information-dense interfaces without visual clutter.
- Make complex workflows understandable.
- Provide clear feedback for every user action.
- Ensure accessibility and responsive behaviour.

### 1.5 Functional Integrity
- UI redesign must never compromise existing functionality.
- Do not replace real functionality with visual placeholders.
- Preserve existing routes, APIs, workflows and permissions.
- Existing features must retain their original behaviour unless an explicitly approved functional change is requested.

---

# 2. GLOBAL APPLICATION ARCHITECTURE

Use a consistent three-region application layout inspired by the supplied reference.

## 2.1 Left Navigation Sidebar

The sidebar must be consistent throughout the application.

**Width:**
- Expanded: 240–260px.
- Collapsed: 64–76px.

**Structure:**

1. Workspace / organization header.
2. User identity and profile access.
3. Primary navigation.
4. Secondary navigation groups.
5. Administration navigation.
6. Theme and preferences.

**Design rules:**
- Fixed positioning on desktop.
- Independent scrolling when navigation exceeds viewport height.
- Clearly highlighted active navigation item.
- Compact Lucide icons.
- Consistent icon alignment.
- Section labels in muted typography.
- Collapsible navigation groups.
- Tooltips in collapsed mode.
- Notification counters only when meaningful.
- Smooth but subtle collapse transitions.

**Navigation states:**
- Default.
- Hover.
- Active.
- Focused.
- Disabled.
- Expanded.
- Collapsed.

Never display unauthorized navigation items.

## 2.2 Top Navigation Bar

**Height:** 64–72px.

Include:
- Global search.
- Breadcrumbs or current workspace context.
- Quick-create menu.
- Notifications.
- Help/support where available.
- User profile menu.

**Design rules:**
- White or theme-equivalent surface.
- Subtle bottom border.
- Consistent horizontal alignment.
- Avoid unnecessary visual separation.
- Keep frequently used actions accessible.
- Search must remain visually prominent.

## 2.3 Central Workspace

The central content area is the primary working region.

It must dynamically adapt to the selected module.

Every page should follow this hierarchy:

1. Breadcrumb or contextual navigation.
2. Page title.
3. Page description, if useful.
4. Primary and secondary actions.
5. Filters, tabs or view controls.
6. Main content.
7. Pagination or supporting controls where needed.

Do not force all pages into a dashboard-card layout.

Tables, boards, calendars, forms and detailed views must use layouts appropriate to their purpose.

## 2.4 Right Contextual Panel

**Default width:** 280–320px.

The right panel must be optional and collapsible.

It may contain:
- My Tasks.
- Today's Tasks.
- Notifications.
- Recent Activity.
- Upcoming Deadlines.
- Task Details.
- Project Information.
- Contextual Information.

Rules:
- Display information relevant to the current page.
- Avoid duplicating content already visible in the workspace.
- Allow the main workspace to expand when the panel is closed.
- Use a drawer on tablet and mobile.
- Do not make the right panel mandatory for core functionality.

---

# 3. COLOUR DESIGN SYSTEM

Use a neutral-first colour palette with restrained blue accents.

## 3.1 Primary Palette

| Token | Colour | Usage |
|---|---|---|
| Primary | #2563EB | Main actions |
| Primary Hover | #1D4ED8 | Hover state |
| Primary Light | #EFF6FF | Selected backgrounds |
| Background | #F5F6F8 | Application background |
| Surface | #FFFFFF | Cards and panels |
| Text Primary | #17191F | Main content |
| Text Secondary | #6B7280 | Supporting text |
| Text Muted | #9CA3AF | Secondary metadata |
| Border | #E5E7EB | Separators |
| Input Border | #D1D5DB | Input outlines |

## 3.2 Semantic Colours

| Meaning | Colour | Usage |
|---|---|---|
| Success | #16A34A | Completed, successful |
| Warning | #D97706 | Approaching deadline |
| Danger | #DC2626 | Overdue, destructive |
| Information | #2563EB | Informational states |
| Neutral | #64748B | Inactive, unassigned |

## 3.3 Task Status Colours

Use a consistent status colour mapping.

Suggested visual mapping:

- Backlog: Neutral Grey.
- Open: Blue.
- To Do: Slate.
- In Progress: Blue.
- In Review: Purple.
- Blocked: Red.
- Completed: Green.
- Cancelled: Grey.

Map these visual styles to existing application statuses. Do not create or rename backend statuses.

## 3.4 Priority Colours

- Critical: Dark Red.
- High: Orange.
- Medium: Amber.
- Low: Blue or Slate.

Priority must be distinguishable without relying on colour alone.

## 3.5 Colour Usage Rules

- Use primary blue for important interactions.
- Use semantic colours only for meaningful states.
- Avoid introducing multiple competing accent colours.
- Maintain readable text contrast.
- Do not use colour as the only indicator of information.
- Use the same semantic mapping throughout the application.

---

# 4. DARK MODE

Dark mode must be designed as a complete theme, not a colour inversion.

Use theme tokens for every component.

Suggested dark palette:

| Token | Colour |
|---|---|
| Background | #111318 |
| Surface | #191D24 |
| Elevated Surface | #202631 |
| Primary Text | #F3F4F6 |
| Secondary Text | #A1A1AA |
| Muted Text | #71717A |
| Border | #2D333D |
| Primary | #60A5FA |

Rules:
- Maintain proper contrast.
- Avoid pure black backgrounds.
- Preserve semantic status colours.
- Ensure charts and visualizations remain readable.
- Style dropdowns, modals, tooltips and drawers consistently.
- Persist theme preference using the existing application mechanism.

---

# 5. TYPOGRAPHY SYSTEM

**Preferred font:** Inter.

If the project already has a consistent typography system, reuse it unless there is a clear reason to change it.

Suggested typography scale:

| Element | Size | Weight |
|---|---:|---:|
| Main page title | 24px | 600 |
| Section heading | 18px | 600 |
| Card heading | 15–16px | 600 |
| Body | 14px | 400 |
| Secondary text | 13px | 400 |
| Metadata | 12px | 400 |
| Button | 13–14px | 500 |
| Table content | 13–14px | 400 |

Rules:
- Use sentence case.
- Avoid unnecessary uppercase headings.
- Use bold typography sparingly.
- Maintain consistent line heights.
- Avoid excessively small text.
- Maintain readable text hierarchy.

---

# 6. SPACING AND LAYOUT SYSTEM

Use a consistent 4px-based spacing system.

| Token | Value |
|---|---:|
| XS | 4px |
| SM | 8px |
| MD | 12px |
| LG | 16px |
| XL | 20px |
| 2XL | 24px |
| 3XL | 32px |
| 4XL | 40px |
| 5XL | 48px |

Rules:
- Use 24px as a standard desktop page gutter.
- Maintain 16–24px between major sections.
- Maintain 12–16px inside standard cards.
- Use consistent vertical rhythm.
- Align page headers, filters and content.
- Avoid arbitrary margins and padding.

---

# 7. BORDER, RADIUS AND SHADOW SYSTEM

## Border radius

| Component | Radius |
|---|---:|
| Small buttons | 6px |
| Inputs | 8px |
| Standard cards | 10px |
| Dialogs | 12px |
| Large panels | 12–16px |
| Avatars | 50% |

## Borders
- Prefer subtle 1px borders.
- Use borders for separation rather than decoration.
- Avoid thick outlines.
- Maintain consistent border colours.

## Shadows
- Use minimal shadows.
- Apply shadows only where elevation improves usability.
- Avoid strong shadows on every card.
- Use consistent elevation for dropdowns, popovers and dialogs.

---

# 8. BUTTON DESIGN RULES

Maintain a consistent button hierarchy.

### Primary Button
For the main action on a page.

Examples:
- Create Task.
- Create Project.
- Save Changes.

### Secondary Button
For supporting actions.

Examples:
- Cancel.
- Export.
- View Details.

### Tertiary / Ghost Button
For low-emphasis actions.

Examples:
- View More.
- Reset.
- Additional Options.

### Destructive Button
For irreversible or sensitive operations.

Examples:
- Delete.
- Remove Member.
- Archive.

Rules:
- Use consistent button heights.
- Prefer icon + label for important actions.
- Use icon-only buttons only when their purpose is recognizable.
- Provide tooltips for icon-only actions.
- Show disabled and loading states.
- Prevent accidental double submission.
- Do not place multiple competing primary buttons together.

---

# 9. ICONOGRAPHY

Use Lucide icons consistently.

Rules:
- Standard icon size: 18–20px.
- Compact icon size: 16px.
- Navigation icons: 18–20px.
- Large empty-state icons: 32–40px.
- Use consistent stroke weight.
- Never mix unrelated icon libraries unnecessarily.
- Never use emoji as functional icons.
- Use icons with labels when meaning is not immediately obvious.

Icons must communicate function, not merely decorate the interface.

---

# 10. INPUTS AND FORMS

All forms must follow a consistent design.

### Input types
- Text.
- Textarea.
- Number.
- Date.
- Time.
- Search.
- Select.
- Multi-select.
- Checkbox.
- Radio.
- File upload.

Rules:
- Use persistent labels.
- Use placeholders only as supplementary guidance.
- Show required field indicators.
- Provide inline validation.
- Show meaningful error messages.
- Preserve user input when validation fails.
- Use consistent input heights.
- Group related fields.
- Separate complex forms into logical sections.

Suggested input height: 40px.

For complex forms, use:
- Multi-section layouts.
- Tabs where appropriate.
- Side panels or dialogs where appropriate.
- Clear Save and Cancel actions.

Do not create unnecessarily long forms.

---

# 11. TABLE DESIGN RULES

Tables must be optimized for information-heavy workflows.

### Standard table structure
- Header.
- Rows.
- Column labels.
- Sorting controls.
- Filters.
- Row actions.
- Pagination.

Rules:
- Use consistent row heights.
- Maintain readable column widths.
- Support horizontal scrolling when necessary.
- Keep important identifying information visible.
- Use subtle row separators.
- Provide hover states.
- Support selection where bulk actions exist.
- Display loading, empty and error states.
- Keep actions accessible without excessive visual clutter.

Task tables should prioritize:
- Task ID.
- Task title.
- Status.
- Priority.
- Assignee.
- Project.
- Due date.

Do not force every possible field into the default view.

Use column configuration where supported.

---

# 12. TASK AND TICKET CARD DESIGN

All task cards must follow a common visual language.

Suggested card information:

1. Task identifier.
2. Task title.
3. Status.
4. Priority.
5. Assignee avatar.
6. Due date.
7. Project or category.
8. Labels where relevant.

Rules:
- Task title receives the highest visual priority.
- Metadata should remain compact.
- Status and priority should be easily distinguishable.
- Avoid oversized cards.
- Use consistent card spacing.
- Keep contextual actions discoverable.
- Make clickable regions clear.

Task cards in Kanban, dashboards and search results should use shared visual conventions.

---

# 13. KANBAN BOARD DESIGN

Kanban boards must be optimized for workflow visibility.

Rules:
- Use status-based columns.
- Keep column headers compact.
- Display task counts.
- Maintain consistent card dimensions where practical.
- Distinguish blocked and overdue tasks.
- Keep drag handles discoverable where supported.
- Support horizontal scrolling.
- Preserve task movement rules.
- Display loading and empty-column states.

Avoid excessive colours in board backgrounds.

Use neutral columns and coloured status indicators.

---

# 14. PROJECT DESIGN

Project pages must provide clear project context.

Project cards should display:
- Project name.
- Description.
- Progress.
- Project status.
- Project owner.
- Member avatars.
- Deadline.
- Task completion statistics.

Project details should use a consistent navigation structure.

Suggested tabs:
- Overview.
- Tasks.
- Board.
- Calendar.
- Activity.
- Members.
- Settings.

Only display tabs supported by actual functionality and the user's permissions.

---

# 15. CALENDAR DESIGN

The calendar must provide clear time-based task visualization.

Supported layouts, where available:
- Month.
- Week.
- Day.

Rules:
- Clearly identify today's date.
- Use semantic colours for task categories.
- Display task titles without unnecessary metadata.
- Prevent overlapping information from becoming unreadable.
- Provide accessible task details on selection.
- Support date navigation.
- Adapt the layout for smaller screens.

---

# 16. MODALS, DRAWERS AND POPOVERS

Use overlays consistently.

### Modal
Use for:
- Confirmation.
- Short forms.
- Critical decisions.
- Focused interactions.

### Drawer
Use for:
- Detailed task information.
- Contextual editing.
- Filters.
- Extended forms.
- Activity history.

### Popover
Use for:
- Quick actions.
- Small contextual menus.
- Compact filters.

Rules:
- Clear title.
- Appropriate description.
- Consistent close behaviour.
- Escape-key support.
- Focus management.
- Clear primary and secondary actions.
- Confirmation before destructive operations.

Avoid nested modal interactions whenever possible.

---

# 17. RBAC AND PERMISSION-AWARE UI

RBAC is a core design requirement.

All navigation and interactions must respect existing authorization.

### Navigation
- Display only authorized modules.
- Respect organization and resource boundaries.
- Do not reveal restricted administrative options.

### Actions
Permission-check:
- Create.
- Read.
- Update.
- Delete.
- Assign.
- Approve.
- Export.
- Manage.

Use existing permission identifiers and authorization utilities.

### Component architecture

Use a centralized permission-aware approach.

Conceptual examples:
- PermissionGate.
- CanAccess.
- CanPerformAction.
- AccessDenied.
- RestrictedState.

These are frontend presentation patterns, not replacements for backend authorization.

### UX behaviour
- Hide actions when appropriate.
- Disable discoverable actions when appropriate.
- Explain restricted actions through tooltips.
- Provide meaningful access-denied screens.
- Do not expose sensitive data through hidden UI components.
- Never hardcode roles or assume every user has the same permissions.

**Backend authorization must remain authoritative.**

---

# 18. SEARCH, FILTERING AND SORTING

Maintain a unified interaction style.

### Search
- Consistent search field.
- Clear button.
- Search suggestions.
- Keyboard navigation.
- Relevant result previews.
- Loading and empty states.

### Filters
- Compact dropdowns.
- Clear selected filter indicators.
- Reset filters.
- Multiple filters where supported.
- Visible filter summaries.
- Consistent filter behaviour across modules.

### Sorting
- Clear ascending/descending indicators.
- Consistent column sorting.
- Preserve existing sorting logic.

### Saved Views
Where supported:
- Save filters.
- Rename views.
- Set default views.
- Manage personal or shared views according to existing permissions.

---

# 19. NOTIFICATIONS AND ACTIVITY

Notifications should be organized and easy to understand.

Include existing notification categories where supported:
- Task assignments.
- Mentions.
- Comments.
- Status changes.
- Project updates.
- Deadlines.
- System notifications.

Rules:
- Unread indicators must be subtle.
- Avoid excessive notification badges.
- Display timestamps consistently.
- Provide clear navigation to the relevant resource.
- Preserve existing notification functionality.

Activity feeds should use a clean timeline structure.

---

# 20. AVATARS AND TEAM REPRESENTATION

Use consistent avatar styling.

Rules:
- Standard avatar: 32px.
- Compact avatar: 24px.
- Large profile avatar: 40–48px.
- Use initials when profile images are unavailable.
- Use consistent fallback colours.
- Display avatar groups with overlapping alignment.
- Use tooltips for member identification.
- Avoid overcrowding avatar groups.

---

# 21. EMPTY, LOADING, ERROR AND SUCCESS STATES

Every major component must account for all operational states.

### Empty State
- Simple icon or illustration.
- Clear heading.
- Short explanation.
- Relevant action if authorized.

### Loading State
- Skeleton loading for major layouts.
- Spinners for short operations.
- Preserve layout dimensions where possible.

### Error State
- Explain what failed.
- Offer a retry action when appropriate.
- Avoid exposing technical stack traces.

### Success State
- Clear confirmation.
- Subtle notification.
- Avoid unnecessary full-page transitions.

Never leave users facing blank or broken interfaces.

---

# 22. RESPONSIVE DESIGN RULES

## Desktop: 1200px and above
- Full sidebar.
- Full central workspace.
- Optional contextual panel.
- Information-dense layouts.

## Tablet: 768px–1199px
- Collapsible sidebar.
- Contextual panel becomes a drawer.
- Flexible grids.
- Adapted table behaviour.

## Mobile: Below 768px
- Mobile navigation drawer.
- Single-column content.
- Full-screen or bottom-sheet task details.
- Touch-friendly actions.
- Compact page headers.
- Horizontally scrollable boards where appropriate.
- Responsive filters.
- No unintended horizontal overflow.

Rules:
- Never simply scale down the desktop interface.
- Prioritize the most important information.
- Keep primary actions accessible.
- Use appropriate touch targets.
- Ensure all important workflows remain usable.

---

# 23. ACCESSIBILITY

Follow WCAG 2.2 AA principles wherever practical.

Requirements:
- Sufficient contrast.
- Keyboard accessibility.
- Visible focus indicators.
- Semantic HTML.
- Accessible labels.
- Screen-reader-friendly controls.
- Appropriate ARIA attributes.
- Keyboard-accessible menus and dialogs.
- Do not communicate status through colour alone.
- Respect reduced-motion preferences.

Accessibility is part of the design, not a final optional enhancement.

---

# 24. MOTION AND MICRO-INTERACTIONS

Use subtle, purposeful transitions.

Suggested duration:
- Hover: 120–150ms.
- Dropdown: 150ms.
- Drawer: 180–220ms.
- Modal: 150–200ms.
- Sidebar collapse: 180–220ms.

Use motion for:
- Opening and closing menus.
- Expanding panels.
- Hover feedback.
- State changes.
- Drag-and-drop feedback.

Avoid:
- Continuous animations.
- Unnecessary bouncing.
- Excessive scaling.
- Distracting transitions.
- Animations that delay important actions.

Respect reduced-motion settings.

---

# 25. DESIGN SYSTEM COMPONENT REUSE

Every module must use the shared design system.

Establish reusable components for:

- AppShell.
- Sidebar.
- Topbar.
- PageHeader.
- PageToolbar.
- Buttons.
- Inputs.
- Dropdowns.
- Tabs.
- Cards.
- Tables.
- TaskCard.
- ProjectCard.
- StatusBadge.
- PriorityBadge.
- Avatar.
- AvatarGroup.
- FilterBar.
- Modal.
- Drawer.
- Tooltip.
- Popover.
- Notification.
- EmptyState.
- LoadingState.
- ErrorState.
- PermissionGate.

Do not create visually different versions of the same component without a justified functional reason.

All components must use shared design tokens.

---

# 26. PAGE CONSISTENCY RULES

Every new page must:

1. Follow the global application shell.
2. Use established typography.
3. Use established spacing.
4. Use the shared colour system.
5. Use standard button variants.
6. Use standard input components.
7. Follow existing navigation patterns.
8. Respect RBAC.
9. Include loading, error and empty states.
10. Support responsive layouts.
11. Maintain consistent interaction behaviour.
12. Preserve existing application functionality.

A new feature must not introduce a separate design language.

---

# 27. UI IMPLEMENTATION QUALITY RULES

Before creating or modifying any UI:

- Inspect existing reusable components.
- Check whether a component already exists.
- Reuse existing business logic.
- Reuse existing API hooks and data fetching.
- Reuse existing permission utilities.
- Avoid duplicate state management.
- Avoid unnecessary dependencies.
- Follow the project's established coding conventions.

Never:
- Add static placeholder data to production interfaces.
- Introduce hardcoded user permissions.
- Duplicate API calls unnecessarily.
- Break existing routes.
- Create inaccessible custom controls.
- Implement fake interactions.
- Hide application errors with misleading success messages.

---

# 28. DESIGN REVIEW CHECKLIST

Before marking any UI task complete, verify the following.

### Visual consistency
- [ ] Correct colour tokens.
- [ ] Correct typography.
- [ ] Correct spacing.
- [ ] Correct border and radius.
- [ ] Consistent icons.
- [ ] Consistent component sizes.

### Usability
- [ ] Clear page hierarchy.
- [ ] Accessible primary actions.
- [ ] Understandable interactions.
- [ ] Appropriate feedback.
- [ ] Useful empty states.
- [ ] No unnecessary visual clutter.

### Functionality
- [ ] Existing functionality preserved.
- [ ] Real data displayed.
- [ ] API integrations preserved.
- [ ] Existing navigation preserved.
- [ ] No fake or placeholder actions.

### RBAC
- [ ] Navigation respects permissions.
- [ ] Actions respect permissions.
- [ ] Resource visibility is respected.
- [ ] Administrative interfaces are protected.
- [ ] Backend authorization remains unchanged.

### Responsiveness
- [ ] Desktop tested.
- [ ] Tablet tested.
- [ ] Mobile tested.
- [ ] No unintended overflow.
- [ ] Touch interactions work.

### Accessibility
- [ ] Keyboard navigation.
- [ ] Focus visibility.
- [ ] Contrast.
- [ ] Labels.
- [ ] Semantic controls.

---

# 29. FINAL DESIGN PRINCIPLE

The entire application must feel like one cohesive product.

The dashboard, project pages, task details, Kanban boards, calendars, reports, settings and administrative interfaces must share the same design language.

The supplied reference image defines the visual direction:

- Clean three-panel layout.
- Minimal white surfaces.
- Subtle neutral backgrounds.
- Blue primary actions.
- Compact navigation.
- Rounded cards.
- Clear information hierarchy.
- Contextual task panels.

However, functionality and usability must determine the layout of each individual module.

**The ultimate objective is to create a professional, scalable, intuitive enterprise productivity platform where users can manage complex work efficiently without fighting the interface.**

Treat this document as the mandatory UI/UX standard for all existing and future frontend development.