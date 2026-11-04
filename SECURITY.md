# Security and disclosure

This repository is a **portfolio code snapshot**, not a production-hardened multi-user application.

## Excluded from public release
- Actual business contact/address details and customer/order records
- Live Firebase project configuration and project selection
- OAuth tokens, service account credentials, logs and local cache

## Important open issues
1. **Firestore access**: Anonymous Firebase Auth with rules checking only `request.auth != null` does not restrict records to the shop owner. Deploy owner-specific authorization before using real data.
2. **Stored XSS**: Dynamic `innerHTML` interpolation of names/notes can inject markup; apply escaping or DOM text nodes.
3. **Order IDs**: `max(orderNo) + 1` on client can race. Use a Firestore transaction or server-controlled ID allocation.
4. **Data protection**: Real names, phone numbers, measurements and photos are private customer data. Avoid public screenshots and public test databases containing such data.

Do not run `firebase deploy` blindly against the client project. This repository ships hosting-only config and a deny-all example rules file on purpose.
