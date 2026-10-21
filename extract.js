import fs from 'fs';
const html = fs.readFileSync('D:/New folder/aeck/ui-ux-ex/portal/b32c4708-c1c6-4b92-bcb6-3177bad1662d.htm', 'utf8');
const bodyStart = html.indexOf('<body');
const bodyEnd = html.indexOf('</body>');
let bodyStr = html.substring(bodyStart, bodyEnd > -1 ? bodyStart + 3000 : bodyStart + 3000);
bodyStr = bodyStr.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
bodyStr = bodyStr.replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '');
console.log(bodyStr.substring(0, 2000));
