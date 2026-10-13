# 9. Progress photos are face-blurred on the device; originals never reach the server

- Status: accepted
- Date: 2026-10-13

Progress photos are the most sensitive data in DaFit, and during the beta our database is outside Russia (ADR 0011). The client's browser detects and blurs faces **before upload** (plus a manual blur brush and crop); only the blurred image is uploaded, EXIF stripped, into a private bucket served through short-lived signed URLs. If no face is detected the user must confirm none is visible. A trainer sees photos only after the client explicitly enables it for that pair; deleting a photo deletes it everywhere. Server-side blurring was rejected because it would require receiving the unblurred original.
