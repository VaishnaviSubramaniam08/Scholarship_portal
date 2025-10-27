# Document Display Fix - Reviewer Dashboard

## Issue
Student-uploaded documents were not displaying in the Reviewer Dashboard despite being uploaded successfully.

## Root Cause
**Field Name Mismatch** between the Student model and Application model:
- Student model documents had fields: `name`, `type`, `url`, `uploadedAt`
- Application model expected: `name`, `fileType`, `fileUrl`, `uploadedAt`
- ReviewerDashboard was trying to access: `doc.fileType` and `doc.fileUrl`

## Solution Implemented

### 1. Updated Student Model (server/models/Student.js)
Changed document schema fields from:
```javascript
documents: [{
  name: String,
  type: String,        // ❌ Changed to fileType
  url: String,         // ❌ Changed to fileUrl
  uploadedAt: Date
}]
```

To:
```javascript
documents: [{
  name: String,
  fileType: String,    // ✅ Matches Application model
  fileUrl: String,     // ✅ Matches Application model
  uploadedAt: Date
}]
```

### 2. Updated Document Upload Route (server/routes/students.js)
Changed the document mapping in the `/api/students/profile/documents` POST route:
```javascript
const newDocuments = req.files.map(file => ({
  name: file.originalname,
  fileType: file.mimetype,    // ✅ Updated field name
  fileUrl: getFileUrl(file.filename)   // ✅ Updated field name
}));
```

## Complete Data Flow

1. **Document Upload** → `POST /api/students/profile/documents`
   - Files uploaded with fields: name, fileType, fileUrl, uploadedAt
   - Stored in Student.documents array

2. **Application Submission** → `POST /api/applications`
   - Documents copied from Student model: `documents: student.documents || []`
   - Stored in Application.documents array

3. **Reviewer Dashboard** → `GET /api/applications/review`
   - Documents explicitly selected in query: `.select('... documents ...')`
   - Contains full document objects with all fields

4. **Display in Modal** → ReviewerDashboard.js (lines 370-404)
   - Shows documents with proper field access:
     - `doc.name` - file name
     - `doc.fileType` - MIME type
     - `doc.fileUrl` - URL to view/download
     - `doc.uploadedAt` - upload date

## Files Modified
- ✅ `server/models/Student.js` - Updated document schema
- ✅ `server/routes/students.js` - Updated upload route to use new field names

## Already Implemented (No Changes Needed)
- ✅ `server/routes/application.js` - Correctly copies and selects documents
- ✅ `client/components/dashboards/ReviewerDashboard.js` - Properly displays documents

## Testing the Fix

1. Student completes profile and uploads documents
2. Student applies for a scholarship
3. Documents are copied to Application
4. Reviewer views application in dashboard
5. **Documents section should now display** with:
   - Document count
   - Each document as a card with name, type, and date
   - "View" button to open document in new tab
   - Warning message if no documents uploaded

## Result
✅ Student documents now properly display in the Reviewer Dashboard for review