const fs = require('fs');
const path = 'src/modules/iot/iot-v2-compat.service.ts';
let content = fs.readFileSync(path, 'utf8');

content = content.replace(/farm_house_interface_mapping/g, 'mon_house_device_mapping');
content = content.replace(/farm_device_property_dict/g, 'mon_device_property_dict');
content = content.replace(/farm_device_realtime_snapshot/g, 'mon_device_realtime_snapshot');
content = content.replace(/farm_device_alert_event/g, 'mon_device_alert_event');
content = content.replace(/farm_device_property_history/g, 'mon_device_property_history');
content = content.replace(/farm_device_property_daily_agg/g, 'mon_device_property_daily_agg');
content = content.replace(/farm_device_ops_log/g, 'mon_device_ops_log');
content = content.replace(/farm_device_sync_job_log/g, 'mon_device_sync_job_log');
content = content.replace(/farm_device_info/g, 'mon_device_info');
content = content.replace(/farm_vendor_house_cache/g, 'mon_vendor_house_cache');

fs.writeFileSync(path, content);
console.log('Patch complete!');
