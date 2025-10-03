# Product Requirements Document (PRD)
## Emergency Response Team (ERT) Management System

**Version:** 7.5
**Date:** October 2025
**Project:** ERT Dashboard - Emergency Management Platform

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Product Overview](#product-overview)
3. [Technical Architecture](#technical-architecture)
4. [Core Features](#core-features)
5. [User Interface & Experience](#user-interface--experience)
6. [Data Management](#data-management)
7. [Security & Authentication](#security--authentication)
8. [Integration & APIs](#integration--apis)
9. [File Structure & Components](#file-structure--components)
10. [Deployment & Configuration](#deployment--configuration)
11. [Performance & Scalability](#performance--scalability)
12. [Future Roadmap](#future-roadmap)

---

## Executive Summary

The ERT (Emergency Response Team) Management System is a comprehensive web-based platform designed for emergency management and coordination. Built with Next.js 15 and Firebase, it provides real-time task management, resident tracking, event logging, and emergency location services for emergency response teams.

### Key Value Propositions
- **Real-time Collaboration**: Live updates across all team members
- **Comprehensive Task Management**: Kanban-style task organization with drag-and-drop
- **Resident Management**: Complete resident database with status tracking
- **Emergency Integration**: Embedded emergency locator map service
- **Multi-language Support**: Hebrew-first interface with RTL support
- **Mobile-Responsive**: PWA capabilities for field operations

---

## Product Overview

### Target Users
- **Emergency Response Team Members**: Field operators, coordinators, managers
- **Administrators**: System administrators, team leaders
- **Residents**: Community members requiring assistance during emergencies

### Use Cases
1. **Emergency Event Management**: Coordinate response during emergencies
2. **Task Assignment & Tracking**: Assign and monitor tasks across team members
3. **Resident Status Monitoring**: Track resident needs and status updates
4. **Event Logging**: Maintain comprehensive logs of all activities
5. **Resource Coordination**: Manage and allocate emergency resources

### Business Goals
- Improve emergency response efficiency
- Enhance team coordination and communication
- Provide real-time visibility into emergency situations
- Maintain comprehensive records for post-event analysis
- Ensure resident safety and well-being during emergencies

---

## Technical Architecture

### Technology Stack

#### Frontend
- **Framework**: Next.js 15.2.4 (React 19.0.0)
- **Styling**: Tailwind CSS 3.4.17 with custom design system
- **UI Components**: Radix UI primitives with shadcn/ui
- **State Management**: React Context API + Firebase real-time listeners
- **Drag & Drop**: @dnd-kit for task management
- **Charts**: Recharts for data visualization
- **Calendar**: FullCalendar + React Big Calendar
- **Icons**: Lucide React + React Icons

#### Backend & Database
- **Database**: Firebase Firestore (NoSQL)
- **Authentication**: Firebase Auth with Google OAuth
- **Real-time**: Firebase real-time listeners
- **File Storage**: Firebase Storage
- **Hosting**: Firebase Hosting (configured)

#### External Integrations
- **Google Sheets**: Data source for residents via Google Apps Script
- **Emergency Locator**: Separate Firebase project for location services
- **Claude AI**: Task parsing and natural language processing
- **WhatsApp**: Communication integration (via Google Apps Script+Twilio)

### Architecture Patterns
- **Component-Based Architecture**: Modular React components
- **Real-time Data Flow**: Firebase listeners for live updates
- **Progressive Web App**: Offline capabilities and mobile optimization
- **Microservices Integration**: Separate services for specialized functions

---

## Core Features

### 1. Task Management System

#### Task Management Interface
- **Event-Based Task Creation**: Tasks created directly from event logs
- **Department-Based Assignment**: Tasks assigned to specific departments
- **Categories**: 
  - לוגיסטיקה (Logistics)
  - אוכלוסיה (Population)
  - רפואה (Medical)
  - חוסן (Resilience)
  - חמ״ל (Command Center)
  - אחר (Other)
- **Priorities**: דחוף (Urgent), רגיל (Normal), נמוך (Low)
- **Status Tracking**: Real-time status updates linked to events and residents

#### Task Features
- **Event Integration**: Tasks automatically linked to event logs
- **Resident Integration**: Tasks can be assigned to specific residents
- **Department Assignment**: Tasks assigned to departments (לוגיסטיקה, אוכלוסיה, רפואה, חוסן, חמ״ל, אחר)
- **Status Synchronization**: Task status updates automatically sync with linked events
- **Cross-Reference**: Tasks show linked events and residents in expanded views
- **Real-time Updates**: Live status updates across all connected components

#### File References
- `components/EventLogBlock.js` - Event logging with task creation functionality
- `components/ResidentsManagement.js` - Resident management with task assignment
- `components/TaskManager.js` - Main task management component
- `components/TaskManager-2.js` - Alternative task manager - not in use
- `components/TaskTabs.js` - Task organization tabs

### 2. Resident Management System

#### Resident Database
- **Data Source**: Google Sheets integration via Firebase
- **Fields**:
  - שם משפחה (Last Name)
  - שם פרטי (First Name)
  - טלפון (Phone)
  - שכונה (Neighborhood)
  - בית (House Number)
  - הערות (Notes)
  - סטטוס (Status)
- **Status Options**: כולם בסדר (All OK), זקוקים לסיוע (Need Help), לא בטוח (Uncertain), פצוע (Injured)

#### Resident Features
- **Real-time Updates**: Live status updates from Google Sheets
- **Task Assignment**: Create tasks directly for residents with department assignment
- **Status Management**: Update resident status with dropdown interface (כולם בסדר, זקוקים לסיוע, לא בטוח, פצוע)
- **Comments**: Add notes and comments to resident records
- **Status History**: Track all status changes with timestamps and user attribution
- **Assigned Tasks**: View and manage tasks assigned to specific residents
- **Expandable Details**: View extended resident information (מספר בית, הורה/ילד, מסגרת, etc.)

#### File References
- `components/ResidentsManagement.js` - Main resident management component
- `app/api/sync-residents/route.js` - Webhook for Google Sheets sync
- `google-apps-script-residents-sync.js` - Google Apps Script integration

### 3. Event Logging System

#### Event Management - יומן חמל
- **Event Creation**: Create and manage emergency events
- **Event Naming**: Admin-configurable event names
- **Department Filtering**: Filter by department (לוגיסטיקה, אוכלוסיה, רפואה, חוסן, חמ״ל, אחר)
- **Status Tracking**: Track event status (מחכה, בטיפול, טופל)
- **Import/Export**: CSV and Excel import/export functionality

#### Event Features
- **Real-time Logging**: Live event updates with Firestore listeners
- **Department Assignment**: Assign events to specific departments (לוגיסטיקה, אוכלוסיה, רפואה, חוסן, חמ״ל, אחר)
- **Status Management**: Track event status (מחכה, בטיפול, טופל) with color coding
- **Task Creation**: Create tasks directly from events with department assignment
- **History Tracking**: Complete audit trail of all event updates and changes
- **Linked Tasks**: View and manage tasks linked to specific events
- **Inline Editing**: Edit event details directly in the table interface

#### File References
- `components/EventLogBlock.js` - Main event logging component

### 4. Real-time Situation Dashboard (תמונת מצב)

The Situation Dashboard provides a high-level, real-time overview of an ongoing emergency event, compiling data from various sources into a single, comprehensive view for managers. It is accessible via a "תמונת מצב" button in the application header.

#### Dashboard Components
- **Event Clock**: A ticking digital clock at the top of the dashboard displays the elapsed time since the emergency event was initiated.
- **Resident Status Summary**: An infographic that shows the count and percentage of residents in each status category: 'הכל בסדר' (All OK), 'זקוקים לסיוע' (Need Help), 'לא בטוח' (Uncertain), 'פצוע' (Injured), and 'ללא סטטוס' (No Status). It includes a specific section to list details of injured residents.
- **Task Metrics Summary**: Provides key performance indicators for task management, including a breakdown of open vs. closed tasks per category, the average task completion time, and the average response time.
- **Dynamic Event Narrative**: A text summary that interprets the "story" of the event based on the event log. This narrative updates in real-time as new logs are added, with a history of previous summaries saved for post-event analysis.
- **Interactive Live Timeline**: A visual timeline of all key activities during the event.
  - **Event-Types**: Displays resident status changes, task creations, task completions, and event log updates, each represented by a different color.
  - **Layout Toggle**: Users can switch between a vertical and a horizontal timeline layout.
  - **Interactive Events**: Clicking on an event on the timeline opens a modal with detailed information.
  - **Filtering**: A dropdown menu allows users to filter which event types are displayed on the timeline.
  - **Zoom Control**: In the horizontal view, users can zoom in and out to adjust the spacing between events.

#### File References
- `components/EventStatus.js` - The main component for the Situation Dashboard.

### 5. Leads and Candidate Management

#### Lead & Candidate Tracking
- **Lead Pipeline**: Manages potential clients/candidates from creation to resolution using a Kanban-style board, a customer journey timeline, and a funnel view.
- **Status Management**: Customizable statuses for tracking lead progress (e.g., 'חדש', 'נקבע יעוץ', 'לא מעוניינים').
- **Data Persistence**: Filters, sorting preferences, and view states are saved locally for user convenience.
- **Real-time Updates**: Listens to the 'leads' collection in Firestore for live data.

#### Lead Interaction & Actions
- **Click-to-Call**: Integration with an external PBX system to initiate calls directly from the interface.
- **WhatsApp Integration**: Quick links to open WhatsApp chats.
- **Conversation History**: Log and view conversation summaries for each lead.
- **Follow-up Tracking**: A dedicated system to mark, count, and reset follow-up calls.
- **Task Creation**: Create new tasks in the main Task Management System directly from a lead's details.

#### File References
- `components/CandidatesBlock.js` - Main component for managing treatment program candidates.
- `components/NewLeadsManager.js` - Component offering multiple views (Kanban, Timeline, Funnel) for lead management.

### 6. Emergency Locator Integration

#### Map Services
- **Embedded Map**: iframe integration with emergency locator service
- **Location Tracking**: Real-time location services
- **Emergency Events**: Integration with emergency event management
- **User Authentication**: Secure access to location services

#### File References
- `components/SimpleEmergencyLocator.js` - Emergency locator component
- `components/EmergencyLocatorIntegration.js` - Advanced integration component

### 7. WhatsApp Emergency Communication System

#### Emergency Messaging
- **Twilio Integration**: WhatsApp Business API via Twilio
- **Template Messages**: Pre-approved message templates for emergency communications
- **Bulk Messaging**: Send messages to all residents simultaneously
- **Status Tracking**: Track message delivery and user responses
- **Reply Handling**: Process and categorize user replies

#### Communication Features
- **"ירוק בעיניים" (Green in Eyes)**: Emergency communication sequence
- **Phone Number Normalization**: Automatic phone number formatting for international messaging
- **Rate Limiting**: Built-in delays to prevent API rate limiting
- **Error Handling**: Comprehensive error tracking and status updates
- **Firebase Sync**: Automatic sync of message status to Firebase

#### Message Flow
- **Template Selection**: Choose from pre-approved message templates
- **Recipient Management**: Target specific residents or send to all
- **Delivery Confirmation**: Track message delivery status
- **Response Processing**: Handle and categorize user replies
- **Status Updates**: Update resident status based on responses

#### File References
- `combined-whatsapp-firebase-script-v3.js` - Latest WhatsApp + Firebase integration
- `combined-whatsapp-firebase-script-v2.js` - Enhanced WhatsApp integration
- `combined-whatsapp-firebase-script.js` - Basic WhatsApp + Firebase integration

### 8. Notes & Links Management - allows users to save links at the header and make notes for themselves or others.

#### Information Management
- **Notes System**: Add and manage notes
- **Links Repository**: Store and organize important links
- **User Attribution**: Track who added notes/links
- **Search**: Search through notes and links

#### File References
- `components/NotesAndLinks.js` - Notes and links management

### 9. Emergency Event Wrap-up & Analysis System

#### Post-Event Analysis
- **Event Timeline**: Complete chronological timeline of all activities
- **Task Lifecycle Tracking**: Track task creation, assignment, status changes, and completion
- **Status Change History**: Detailed log of all resident and event status updates
- **Performance Metrics**: Response times, completion rates, and efficiency metrics
- **Learning Reports**: Automated analysis for process improvement

#### Wrap-up Features
- **Event Closure**: Formal event closure with final status updates
- **Data Export**: Export complete event data for analysis
- **Timeline Generation**: Generate detailed timeline reports
- **Performance Analysis**: Analyze response times and effectiveness
- **Lessons Learned**: Document key learnings and improvement opportunities
- **Report Generation**: Create comprehensive post-event reports

#### Analysis Components
- **Chronological Timeline**: All events, tasks, and status changes in sequence
- **Department Performance**: Track performance by department (לוגיסטיקה, אוכלוסיה, רפואה, חוסן, חמ״ל)
- **Response Time Analysis**: Measure time from event creation to resolution
- **Task Completion Rates**: Track task completion and success rates
- **Resource Utilization**: Analyze resource allocation and usage
- **Communication Flow**: Track information flow and communication patterns

#### File References
- `components/EventAnalysis.js` - Event analysis and reporting component
- `components/TimelineGenerator.js` - Timeline generation component
- `app/api/event-analysis/route.js` - Event analysis API endpoint
- `lib/eventAnalytics.js` - Event analytics and reporting utilities

### 10. User Management & Authentication

#### Authentication System
- **Firebase Auth**: Google OAuth integration
- **Role-Based Access**: Admin and staff roles
- **User Profiles**: User management and profiles
- **Session Management**: Secure session handling

#### File References
- `app/context/AuthContext.js` - Authentication context
- `app/login/page.js` - Login page

---

## User Interface & Experience

### Design System

#### Visual Design
- **Color Scheme**: Professional blue and gray palette
- **Typography**: Geist font family (Sans & Mono)
- **Layout**: RTL (Right-to-Left) support for Hebrew
- **Responsive**: Mobile-first responsive design
- **Accessibility**: WCAG compliant with proper contrast ratios

#### Component Library
- **Base Components**: Button, Input, Select, Dialog, Card, etc.
- **Complex Components**: Kanban board, data tables, calendars
- **Interactive Elements**: Drag-and-drop, tooltips, dropdowns
- **Feedback Systems**: Toast notifications, loading states

#### File References
- `components/ui/` - Complete UI component library
- `app/globals.css` - Global styles and CSS variables
- `tailwind.config.js` - Tailwind configuration
- `components.json` - shadcn/ui configuration

### User Experience Features

#### Navigation
- **Tabbed Interface**: Organized content in tabs
- **Collapsible Sections**: Expandable/collapsible content areas
- **Search Functionality**: Global search across all data
- **Filtering**: Advanced filtering options

#### Interaction Patterns
- **Drag & Drop**: Intuitive task management
- **Real-time Updates**: Live data synchronization
- **Keyboard Shortcuts**: Power user shortcuts
- **Mobile Gestures**: Touch-friendly interactions

#### File References
- `components/TabsManager.js` - Tab management system
- `components/DroppableCalendar.js` - Calendar with drag-and-drop

---

## Data Management

### Database Schema

#### Firestore Collections

##### Users Collection (`users`)
```javascript
{
  uid: string,
  email: string,
  displayName: string,
  role: 'admin' | 'staff',
  alias: string,
  createdAt: timestamp,
  lastLogin: timestamp
}
```

##### Tasks Collection (`tasks`)
```javascript
{
  id: string,
  title: string,
  subtitle: string,
  category: string,
  department: string,
  priority: 'דחוף' | 'רגיל' | 'נמוך',
  status: string,
  assignTo: string,
  createdBy: string,
  creatorId: string,
  creatorAlias: string,
  createdAt: timestamp,
  updatedAt: timestamp,
  dueDate: timestamp,
  done: boolean,
  replies: array,
  nudges: array,
  // Event integration
  eventId: string,
  eventStatus: string,
  // Resident integration
  residentId: string,
  residentName: string,
  residentPhone: string,
  residentNeighborhood: string,
  residentStatus: string
}
```

##### Residents Collection (`residents`)
```javascript
{
  id: string,
  timestamp: timestamp,
  'שם משפחה': string,
  'שם פרטי': string,
  'טלפון': string,
  'שכונה': string,
  'בית': string,
  'הערות': string,
  'סטטוס': string,
  event_id: string,
  syncedAt: timestamp,
  createdAt: timestamp,
  updatedAt: timestamp,
  // Extended fields from Google Sheets
  'מספר בית': string,
  'הורה/ילד': string,
  'מסגרת': string,
  'מקום מסגרת': string,
  'תאריך לידה': string,
  'סטטוס מגורים': string,
  // System fields
  statusHistory: array,
  assignedTasks: array,
  comments: array,
  lastStatusChange: object
}
```

##### Event Logs Collection (`eventLogs`)
```javascript
{
  id: string,
  reporter: string,
  recipient: string,
  description: string,
  department: string,
  status: 'מחכה' | 'בטיפול' | 'טופל',
  createdAt: timestamp,
  updatedAt: timestamp,
  lastUpdater: string,
  history: array,
  // Linked tasks
  linkedTasks: array,
  // Event wrap-up fields
  eventClosed: boolean,
  closedAt: timestamp,
  closedBy: string,
  finalReport: string,
  lessonsLearned: array,
  performanceMetrics: object
}
```

##### Leads Collection (`leads`)
```javascript
{
  id: string,
  fullName: string,
  phoneNumber: string,
  message: string,
  email: string,
  source: string,
  status: string,
  createdAt: timestamp,
  conversationSummary: array,
  followUpCall: { active: boolean, count: number }
}
```

##### Event Analysis Collection (`eventAnalysis`)
```javascript
{
  id: string,
  eventId: string,
  eventName: string,
  startTime: timestamp,
  endTime: timestamp,
  duration: number, // in minutes
  totalEvents: number,
  totalTasks: number,
  completedTasks: number,
  totalResidents: number,
  residentsHelped: number,
  departmentPerformance: {
    לוגיסטיקה: { tasks: number, completed: number, avgResponseTime: number },
    אוכלוסיה: { tasks: number, completed: number, avgResponseTime: number },
    רפואה: { tasks: number, completed: number, avgResponseTime: number },
    חוסן: { tasks: number, completed: number, avgResponseTime: number },
    חמ״ל: { tasks: number, completed: number, avgResponseTime: number }
  },
  timeline: array, // Chronological timeline of all activities
  lessonsLearned: array,
  recommendations: array,
  createdAt: timestamp,
  createdBy: string
}
```

### Data Flow

#### Real-time Synchronization
1. **Google Sheets** → **Google Apps Script** → **Firebase Firestore**
2. **Firebase Firestore** → **React Components** (real-time listeners)
3. **User Actions** → **Firebase Firestore** → **All Connected Clients**

#### Event Analysis Data Flow
1. **Event Creation** → **Task Assignment** → **Status Updates** → **Event Closure**
2. **Data Collection** → **Timeline Generation** → **Performance Analysis** → **Report Generation**
3. **Lessons Learned** → **Recommendations** → **Process Improvement**

#### Data Validation
- **Client-side**: Form validation and type checking
- **Server-side**: Firebase security rules
- **API-level**: Request validation and sanitization

---

## Security & Authentication

### Authentication System

#### Firebase Authentication
- **Provider**: Google OAuth
- **Session Management**: Firebase Auth state persistence
- **Role-based Access**: Admin and staff roles
- **Security Rules**: Comprehensive Firestore security rules

#### Security Rules (`firestore.rules`)
- **User Authentication**: All operations require authentication
- **Role-based Permissions**: Admin and staff access levels
- **Data Validation**: Field validation and type checking
- **Audit Trail**: User attribution for all operations

### Data Security

#### Access Control
- **Collection-level**: Different permissions per collection
- **Document-level**: User-specific access controls
- **Field-level**: Sensitive data protection

#### Privacy & Compliance
- **Data Encryption**: Firebase encryption at rest and in transit
- **User Privacy**: Minimal data collection
- **Audit Logging**: Complete operation logging

---

## Integration & APIs

### External Integrations

#### Google Sheets Integration
- **Purpose**: Primary data source for residents
- **Method**: Google Apps Script webhook
- **Frequency**: Real-time and scheduled sync
- **Data Flow**: Sheets → Apps Script → Firebase → React App

#### Twilio WhatsApp Integration
- **Purpose**: Emergency communication with residents
- **Service**: Twilio WhatsApp Business API
- **Template Messages**: Pre-approved message templates for emergency communications
- **Flow Management**: Automated message flows and response handling
- **Status Tracking**: Message delivery status and user reply tracking
- **Integration**: Google Apps Script with Twilio API

#### Emergency Locator Service
- **Purpose**: Location tracking and emergency mapping
- **Integration**: iframe embedding
- **Authentication**: Cross-project user sync
- **Data**: Location data and emergency events

#### Claude AI Integration
- **Purpose**: Natural language task parsing
- **Endpoint**: `/api/parse-task`
- **Functionality**: Extract structured data from Hebrew text
- **Use Case**: Convert voice/text input to structured tasks

### API Endpoints

#### Internal APIs

##### `/api/leads` (POST)
- **Purpose**: Create new leads from external sources
- **Authentication**: None (webhook endpoint)
- **Validation**: Required fields validation
- **Response**: Lead ID and success status

##### `/api/parse-task` (POST)
- **Purpose**: Parse natural language into structured task data
- **Authentication**: API key required
- **Input**: Hebrew text string
- **Output**: Structured task object

##### `/api/sync-residents` (POST/GET)
- **Purpose**: Sync residents data from Google Sheets
- **Authentication**: None (webhook endpoint)
- **Validation**: Comprehensive field validation
- **Response**: Sync status and data count

##### `/api/event-analysis` (POST/GET)
- **Purpose**: Generate event analysis and timeline reports
- **Authentication**: Required (admin/staff only)
- **Input**: Event ID and analysis parameters
- **Output**: Comprehensive event analysis report

### Webhook System

#### Google Apps Script Webhooks
- **Residents Sync**: Automatic resident data synchronization
- **Task Updates**: Task status updates from external systems
- **Event Logging**: External event data integration
- **WhatsApp Messaging**: Emergency communication triggers
- **"ירוק בעיניים" (Green in Eyes)**: Emergency communication sequence

---

## File Structure & Components

### Project Structure

```
/Users/adam/ert-new/
├── app/                          # Next.js App Router
│   ├── api/                      # API routes
│   │   ├── leads/route.js        # Leads API endpoint
│   │   ├── parse-task/route.js   # Task parsing API
│   │   └── sync-residents/route.js # Residents sync API
│   ├── context/                  # React contexts
│   │   └── AuthContext.js        # Authentication context
│   ├── globals.css               # Global styles
│   ├── layout.js                 # Root layout
│   ├── login/page.js             # Login page
│   └── page.js                   # Main application page
├── components/                   # React components
│   ├── ui/                       # UI component library
│   │   ├── button.jsx            # Button component
│   │   ├── card.jsx              # Card component
│   │   ├── dialog.jsx            # Dialog component
│   │   ├── input.jsx             # Input component
│   │   ├── select.jsx            # Select component
│   │   ├── sortable-category-column.js # Drag-and-drop column
│   │   ├── sortable-item.js      # Draggable item
│   │   └── ...                   # Other UI components
│   ├── CandidatesBlock.js        # Candidates management
│   ├── DroppableCalendar.js      # Calendar with drag-and-drop
│   ├── EmergencyLocatorIntegration.js # Emergency locator
│   ├── EventLogBlock.js          # Event logging
│   ├── EventStatus.js            # Real-time situation dashboard
│   ├── FullCalendarDemo.js       # Calendar demo
│   ├── NewLeadsManager.js        # Leads management
│   ├── NotesAndLinks.js          # Notes and links
│   ├── ResidentsManagement.js    # Resident management
│   ├── SimpleEmergencyLocator.js # Simple emergency locator
│   ├── TabsManager.js            # Tab management
│   ├── TaskManager.js            # Main task manager
│   ├── TaskManager-2.js          # Alternative task manager
│   └── TaskTabs.js               # Task organization
├── lib/                          # Utility libraries
│   ├── auto-sync-emergency-locator.js # Emergency locator sync
│   ├── cross-project-auth.js     # Cross-project authentication
│   ├── emergency-locator-sync.js # Emergency locator sync
│   ├── emergency-locator-sync-realtime.js # Real-time sync
│   └── utils.js                  # Utility functions
├── combined-whatsapp-firebase-script.js # WhatsApp + Firebase integration
├── combined-whatsapp-firebase-script-v2.js # Enhanced WhatsApp integration
├── combined-whatsapp-firebase-script-v3.js # Latest WhatsApp + Firebase integration
├── public/                       # Static assets
├── firebase.js                   # Firebase configuration
├── firestore.rules               # Firestore security rules
├── firebase.json                 # Firebase configuration
├── package.json                  # Dependencies and scripts
├── tailwind.config.js            # Tailwind configuration
└── components.json               # shadcn/ui configuration
```

### Component Architecture

#### Core Components

##### TaskManager.js
- **Purpose**: Main task management interface
- **Features**: Kanban board, drag-and-drop, task creation/editing
- **Dependencies**: @dnd-kit, Firebase, UI components
- **State**: Task data, user interactions, real-time updates

##### ResidentsManagement.js
- **Purpose**: Resident database management
- **Features**: Data table, status updates, task assignment
- **Dependencies**: Firebase, Google Sheets integration
- **State**: Resident data, filtering, editing states

##### EventLogBlock.js
- **Purpose**: Event logging and management
- **Features**: Event creation, department filtering, import/export
- **Dependencies**: Firebase, CSV/Excel parsing
- **State**: Event data, filters, import states

##### EventStatus.js
- **Purpose**: Real-time situation dashboard
- **Features**: Resident/task/log summaries, interactive timeline, event clock.
- **Dependencies**: Firebase, lucide-react, UI components
- **State**: Resident data, task data, event logs, timeline state (filters, layout, zoom), selected event for modal.

##### CandidatesBlock.js & NewLeadsManager.js
- **Purpose**: Leads and candidate pipeline management
- **Features**: Kanban board, timeline/funnel views, status tracking, conversation history, click-to-call, task creation from leads.
- **Dependencies**: Firebase, dnd-kit (for Kanban), UI components
- **State**: Leads data, filters, sorting, view states (e.g., collapsed columns), editing states.

##### SimpleEmergencyLocator.js
- **Purpose**: Emergency location services
- **Features**: Embedded map, location tracking
- **Dependencies**: iframe integration
- **State**: Map state, location data

#### UI Component Library

##### Base Components
- **Button**: Multiple variants (default, destructive, outline, secondary, ghost, link, filteractive)
- **Input**: Text input with validation
- **Select**: Dropdown selection with search
- **Dialog**: Modal dialogs for forms and confirmations
- **Card**: Content containers with headers
- **Checkbox**: Boolean input controls
- **Switch**: Toggle controls
- **Textarea**: Multi-line text input
- **Tooltip**: Contextual help text
- **Toast**: Notification system

##### Complex Components
- **SortableCategoryColumn**: Drag-and-drop column for Kanban
- **SortableItem**: Draggable task items
- **Calendar**: Date selection and event display
- **DropdownMenu**: Context menus and actions

---

## Deployment & Configuration

### Firebase Configuration

#### Project Setup
- **Project ID**: `emergency-dashboard-a3842`
- **Location**: `nam5` (North America)
- **Authentication**: Google OAuth enabled
- **Firestore**: NoSQL database with security rules
- **Hosting**: Static site hosting configured

#### Environment Configuration
```javascript
// firebase.js
const firebaseConfig = {
  apiKey: "AIzaSyADV9_C-i0F91jr8TcOq2zItMsnjag6oyE",
  authDomain: "emergency-dashboard-a3842.firebaseapp.com",
  projectId: "emergency-dashboard-a3842",
  storageBucket: "emergency-dashboard-a3842.firebasestorage.app",
  messagingSenderId: "394209477264",
  appId: "1:394209477264:web:9fdf362f4d744beaa34e15"
};
```

### Build & Deployment

#### Development
```bash
npm run dev          # Start development server
npm run build        # Build for production
npm run start        # Start production server
npm run lint         # Run ESLint
npm run type-check   # TypeScript type checking
```

#### Production Deployment
- **Platform**: Firebase Hosting
- **Build Process**: Next.js static export
- **CDN**: Firebase CDN for global distribution
- **SSL**: Automatic SSL certificates
- **Custom Domain**: Configurable custom domains

### Configuration Files

#### Package.json Dependencies
- **Next.js**: 15.2.4 (React framework)
- **Firebase**: 11.6.0 (Backend services)
- **Tailwind CSS**: 3.4.17 (Styling)
- **Radix UI**: UI primitives
- **@dnd-kit**: Drag and drop functionality
- **Recharts**: Data visualization
- **Moment.js**: Date manipulation
- **Axios**: HTTP client
- **Papa Parse**: CSV parsing
- **XLSX**: Excel file handling

#### Tailwind Configuration
- **Design System**: Custom color palette
- **Components**: shadcn/ui integration
- **Responsive**: Mobile-first approach
- **Dark Mode**: Class-based dark mode support
- **Animations**: Custom keyframes and transitions

---

## Performance & Scalability

### Performance Optimizations

#### Frontend Performance
- **Code Splitting**: Next.js automatic code splitting
- **Image Optimization**: Next.js Image component
- **Bundle Analysis**: Webpack bundle analyzer
- **Lazy Loading**: Component lazy loading
- **Memoization**: React.memo and useMemo for expensive operations

#### Backend Performance
- **Firestore Indexing**: Optimized database queries
- **Real-time Listeners**: Efficient real-time updates
- **Caching**: Firebase caching strategies
- **Pagination**: Large dataset pagination

#### Network Optimization
- **CDN**: Firebase CDN for static assets
- **Compression**: Gzip compression
- **Caching Headers**: Optimized cache headers
- **Progressive Web App**: Offline capabilities

### Scalability Considerations

#### Database Scalability
- **Firestore**: Automatic scaling with usage
- **Indexing**: Composite indexes for complex queries
- **Data Modeling**: Optimized data structure
- **Batch Operations**: Efficient bulk operations

#### Application Scalability
- **Component Architecture**: Modular, reusable components
- **State Management**: Efficient state updates
- **Memory Management**: Proper cleanup and garbage collection
- **Error Handling**: Comprehensive error boundaries

#### User Scalability
- **Concurrent Users**: Firebase handles concurrent connections
- **Real-time Updates**: Efficient real-time synchronization
- **Role-based Access**: Scalable permission system
- **Multi-tenant**: Support for multiple organizations

---

## Future Roadmap

### Short-term Enhancements (Q1 2025)

#### Event Analysis & Learning
- **Event Wrap-up System**: Complete event closure and analysis workflow
- **Timeline Generation**: Automated chronological timeline creation
- **Performance Analytics**: Response time and efficiency metrics
- **Lessons Learned Database**: Centralized repository for improvement insights

#### User Experience Improvements
- **Mobile App**: Native mobile application
- **Offline Support**: Enhanced offline capabilities
- **Push Notifications**: Real-time push notifications
- **Advanced Search**: Full-text search across all data

#### Feature Enhancements
- **Task Templates**: Predefined task templates
- **Bulk Operations**: Bulk task and resident operations
- **Advanced Reporting**: Comprehensive reporting system
- **Data Export**: Enhanced export capabilities

### Medium-term Goals (Q2-Q3 2025)

#### Integration Enhancements
- **WhatsApp Integration**: Direct WhatsApp communication
- **SMS Integration**: SMS notifications and updates
- **Email Integration**: Email notifications and reports
- **Third-party APIs**: Integration with external emergency services

#### Advanced Features
- **AI-powered Insights**: Machine learning for task prioritization and event analysis
- **Predictive Analytics**: Emergency prediction and preparation based on historical data
- **Resource Management**: Advanced resource allocation and optimization
- **Multi-language Support**: Additional language support
- **Advanced Event Analytics**: Machine learning for pattern recognition and improvement recommendations

### Long-term Vision (Q4 2025+)

#### Platform Evolution
- **Microservices Architecture**: Service-oriented architecture
- **API Platform**: Public API for third-party integrations
- **Multi-tenant**: Support for multiple organizations
- **Enterprise Features**: Advanced enterprise capabilities

#### Technology Upgrades
- **Next.js 16**: Latest framework features
- **React 20**: Latest React features
- **TypeScript**: Full TypeScript migration
- **Advanced Security**: Enhanced security features

---

## Conclusion

The ERT Management System represents a comprehensive solution for emergency response team coordination and management. Built with modern web technologies and designed for scalability, it provides real-time collaboration, comprehensive task management, and integrated emergency services.

The system's modular architecture, robust security model, and extensive integration capabilities make it suitable for various emergency management scenarios while maintaining the flexibility to adapt to changing requirements.

### Key Success Factors
- **Real-time Collaboration**: Live updates across all team members
- **Comprehensive Feature Set**: Complete emergency management solution
- **Modern Technology Stack**: Scalable and maintainable architecture
- **User-centered Design**: Intuitive interface for emergency situations
- **Robust Security**: Enterprise-grade security and compliance
- **Extensive Integration**: Seamless integration with external services

This PRD serves as the definitive reference for the ERT Management System, providing comprehensive documentation of all features, architecture, and implementation details for current and future development efforts.

---

**Document Version**: 7.5
**Last Updated**: Oct 2025
**Next Review**: Nov 2025
