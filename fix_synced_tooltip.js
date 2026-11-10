const fs = require('fs');
let content = fs.readFileSync('src/components/ui/sidebar.tsx', 'utf8');

content = content.replace("case 'synced': SyncIcon = Cloud; syncStatusText = 'Synced'; syncTooltipText = 'Data synced with cloud. Click to refresh.'; iconColor = 'text-accent'; break;", "case 'synced': SyncIcon = Cloud; syncStatusText = 'Synced'; syncTooltipText = 'Data is up to date.'; iconColor = 'text-green-500'; isSyncButtonClickable = false; break;");

fs.writeFileSync('src/components/ui/sidebar.tsx', content);
