--- a/src/api/save/route.ts
+++ b/src/api/save/route.ts
@@ -6,7 +6,7 @@
 import { kv } from '@vercel/kv';
 import { logInfo, logWarn, logError } from '@/lib/logger';
 
-const CLERK_DISABLED_PLACEHOLDER_USER_ID = 'user_2wXc4D8KBDKGhxagoRStZOXnP2Y';
+const CLERK_DISABLED_PLACEHOLDER_USER_ID = 'user_2wXc4D8KBDKGhxagoRStZOXnP2Y';
 
 const ratelimit = new Ratelimit({
   redis: kv,
@@ -17,7 +17,7 @@
 
 export async function POST(request: Request) {
   const { userId } = auth();
-
+ 
   if (!userId) {
     return NextResponse.json({ error: 'Unauthorized: User not logged in.' }, { status: 401 });
   }
@@ -75,7 +75,7 @@
         if (gettingStartedDismissed !== undefined) {
             updateDoc.gettingStartedDismissed = gettingStartedDismissed;
         }
-
+ 
 
         if (Object.keys(updateDoc).length > 0) {
              await collection.updateOne(
@@ -98,7 +98,7 @@
   let payload: SaveDataPayload;
   try {
     payload = await request.json();
-  } catch (error) {
+  }  catch (error) {
     return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
   }
 
@@ -194,7 +194,7 @@
 import { prepareDataForHashing } from '@/lib/prepareDataForHashing';
 import stringify from 'fast-json-stable-stringify';
 import { logInfo, logWarn, logError } from '@/lib/logger';
-
+ 
 const CLERK_DISABLED_PLACEHOLDER_USER_ID = 'user_2wXc4D8KBDKGhxagoRStZOXnP2Y';
 
 async function getCollectionData<T>(db: any, collectionName: string, userId: string): Promise<T[]> {
@@ -218,4 +218,4 @@
     }
 }
 
+