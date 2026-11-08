# Lead sorting and direct entry

`/seva/add-lead` opens the existing Seva Add Lead dialog after volunteer sign-in. It uses the current Leads campaign when available, otherwise the first configured Leads campaign. Program and Quality are optional and use the same pickers as lead cards. After saving or cancelling, the URL returns to `/seva`.

The Sort control beside Filter supports name, lead creation time, and last successful update time in both directions. Sorting applies to all matching records before the visible-page limit. The preference is stored per signed-in email in the browser. Legacy records with missing or invalid dates remain after records with known dates, preserving their relative order.

New manual entries, imported leads, and WhatsApp captures receive an immutable `createdAt` timestamp. On first creation, an older sheet receives the missing `createdAt` header after its existing columns; existing rows are not backfilled. Updates and volunteer transfers preserve creation time. New sheet templates include the column through `shared/contracts/sheetContract.mjs`.

After a successful lead save, the app automatically copies a summary using the same formatter as the WhatsApp capture response. No additional lead-details card is displayed. If the browser blocks clipboard access, the existing save notification reports that copying was blocked; the saved lead remains successful. Contact details are not saved in browser local storage. The app does not send a WhatsApp message automatically.

Volunteer reassignment adds a dated transfer entry above the existing notes. Reassigning to the same volunteer does not add a transfer entry.
