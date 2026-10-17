import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
export const pacificDay = (date = new Date()) => new Intl.DateTimeFormat('en-CA',{timeZone:'America/Los_Angeles',year:'numeric',month:'2-digit',day:'2-digit'}).format(date);
export class Store {
  constructor(file) {this.file=file;this.rows=fs.existsSync(file)?JSON.parse(fs.readFileSync(file,'utf8')):[];}
  save(){fs.mkdirSync(path.dirname(this.file),{recursive:true});const temp=this.file+'.tmp';fs.writeFileSync(temp,JSON.stringify(this.rows),{mode:0o600});fs.renameSync(temp,this.file);}
  usage(account,date=new Date()){return this.rows.filter(r=>r.account===account&&r.mode==='research'&&r.day===pacificDay(date)&&!['FAILED','CANCELLED','TIMED_OUT','REJECTED'].includes(r.status)).length;}
  normalUsage(account,date=new Date()){const day=date.toISOString().slice(0,10);return this.rows.filter(r=>r.account===account&&r.mode==='normal'&&r.utcDay===day).reduce((usage,r)=>({searchRequests:usage.searchRequests+(r.searchRequests||0),fetchedUrls:usage.fetchedUrls+(r.fetchedUrls||0)}),{searchRequests:0,fetchedUrls:0});}
  reserve(account,mode,question){if(mode==='research'&&this.usage(account)>=5)throw new Error('Lighthouse has reached its local Research limit for this account today. Wait for the Pacific-day reset.');const now=new Date();const row={id:randomUUID(),account,mode,question,day:pacificDay(now),utcDay:now.toISOString().slice(0,10),createdAt:now.toISOString(),status:'STARTING',searchRequests:0,fetchedUrls:0};this.rows.unshift(row);this.save();return row;}
  update(row,patch){Object.assign(row,patch);this.save();return row;}
}
