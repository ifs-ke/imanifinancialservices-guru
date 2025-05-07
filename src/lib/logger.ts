--- a/src/lib/logger.ts
+++ b/src/lib/logger.ts
@@ -4,7 +4,7 @@
 // import { auth } from '@clerk/nextjs/client'; // Clerk disabled
 
 const LOGTAIL_SOURCE_TOKEN = process.env.NEXT_PUBLIC_LOGTAIL_SOURCE_TOKEN;
-const CLERK_DISABLED_PLACEHOLDER_USER_ID = 'user_2wXc4D8KBDKGhxagoRStZOXnP2Y'; // Placeholder
+const CLERK_DISABLED_PLACEHOLDER_USER_ID = 'user_2wXc4D8KBDKGhxagoRStZOXnP2Y';
 
 let log: Logtail | null = null;
 
@@ -112,4 +115,4 @@
     }
 };
 
+
 export { log as logtailClient };
+