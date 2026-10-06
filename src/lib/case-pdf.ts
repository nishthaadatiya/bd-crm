import type { Content, TDocumentDefinitions, TableCell } from 'pdfmake/interfaces';
import type { CaseReportData } from './case-export-data';
import { getCaseStatusLabel } from './case-status';

const ink = '#14243B';
const teal = '#087E8B';
const text = (value: unknown) => value === null || value === undefined || value === '' ? '—' : String(value);
const title = (value: string) => value.replaceAll('_',' ').replace(/\b\w/g, (c) => c.toUpperCase());
const date = (value: string | null | undefined) => !value ? 'Not set' : new Intl.DateTimeFormat('en-IN', { day:'2-digit',month:'short',year:'numeric',timeZone:'Asia/Kolkata' }).format(new Date(value));
const money = (value: number | null | undefined) => value == null ? 'Not specified' : `INR ${new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2 }).format(value)}`;

export function buildCasePdfDefinition(data: CaseReportData, internal: boolean, now = new Date()): TDocumentDefinitions {
  const c = data.caseData;
  const content: Content[] = [];
  const section = (heading: string) => content.push({ text: heading.toUpperCase(), style:'section', headlineLevel:1, margin:[0,12,0,6] });
  const pairs = (entries: [string, unknown][]) => content.push({
    table: { widths:['29%','71%'], body: entries.map(([label,value]) => [
      {text:label,color:'#64748B',fontSize:9,margin:[8,3,4,3]},
      {text:text(value),color:ink,fontSize:10,margin:[4,3,8,3]},
    ]) }, layout: { hLineWidth:()=>0.4,vLineWidth:()=>0,hLineColor:()=> '#E2E8F0',fillColor:(row:number)=>row%2===0?'#F8FAFC':null },
  });
  const table = (headers: string[], rows: TableCell[][], widths: (string | number)[]) => content.push({
    table: { headerRows:1, keepWithHeaderRows:1, widths, body:[headers.map((label)=>({text:label,bold:true,color:'#FFFFFF',fillColor:ink,margin:[5,5,5,5]})),...rows] },
    layout: { hLineWidth:()=>0.4,vLineWidth:()=>0,hLineColor:()=> '#E2E8F0',paddingTop:()=>6,paddingBottom:()=>6,paddingLeft:()=>5,paddingRight:()=>5 },fontSize:9,
  });
  content.push({text:internal?'CASE MANAGEMENT REPORT':'CASE PROGRESS UPDATE',fontSize:10,bold:true,color:teal,characterSpacing:2,margin:[0,0,0,10]});
  content.push({text:c.case_number,fontSize:30,bold:true,color:ink,margin:[0,0,0,5]});
  content.push({text:c.customer?.full_name || 'Customer',fontSize:17,color:'#475569',margin:[0,0,0,18]});
  content.push({table:{widths:['*','*'],body:[[
    {stack:[{text:'CURRENT STEP',fontSize:8,bold:true,color:'#64748B'},{text:getCaseStatusLabel(c.status),fontSize:15,bold:true,color:teal,margin:[0,5,0,0]}],fillColor:'#EFF9FA',margin:[12,12,12,12]},
    {stack:[{text:'LAST UPDATED',fontSize:8,bold:true,color:'#64748B'},{text:date(c.updated_at),fontSize:15,bold:true,color:ink,margin:[0,5,0,0]}],fillColor:'#F1F5F9',margin:[12,12,12,12]},
  ]]},layout:'noBorders'});
  section('Case overview');
  pairs([
    ['Customer', c.customer?.full_name],['Case type',title(c.case_type)],
    ['Project / property', c.building?.name],['Assigned representative',c.assigned_profile?.full_name || 'Not assigned'],
    ['Opened on',date(c.created_at)],['Target completion',date(c.expected_completion_date)],
    ['Current step due',date(c.stage_due_date)],['Work condition',c.work_flag && c.work_flag!=='none'?title(c.work_flag):'No delay flagged'],
  ]);
  section('Loan & application');
  pairs([
    ['Lender / bank',c.bank_name],['Application number',c.application_number],['Loan product',c.loan_type],
    ['Requested loan',money(c.loan_amount)],['Property value',money(c.property_value)],
    ['Tenure',c.loan_tenure_months == null ? 'Not specified' : `${c.loan_tenure_months} months`],
    ['Interest rate',c.interest_rate == null ? 'Not specified' : `${c.interest_rate}%`],
  ]);
  const relevant = data.requirements.filter((req)=> internal || req.stage_id===c.current_stage_id || data.documents.some((doc)=>doc.requirement_id===req.id));
  section('Document checklist');
  const docRows: TableCell[][] = relevant.map((req)=>{
    const latest=data.documents.find((doc)=>doc.requirement_id===req.id);
    return [req.name, req.is_mandatory?'Required':'Optional', latest?title(latest.status):'Not uploaded'];
  });
  data.documents.filter((doc)=>!doc.requirement_id).forEach((doc)=>docRows.push([doc.document_name,'Additional',title(doc.status)]));
  if(docRows.length) table(['Document','Requirement','Status'],docRows,['52%','20%','28%']);
  else content.push({text:'No document checklist entries available.',color:'#64748B'});
  section('Work summary');
  const completed=data.tasks.filter((task)=>task.status==='completed').length;
  const open=data.tasks.filter((task)=>task.status==='pending'||task.status==='in_progress').length;
  content.push({text:`${completed} task(s) completed • ${open} task(s) open`,bold:true,color:ink,margin:[0,0,0,8]});
  if(internal){
    if(data.tasks.length) table(['Task','Assigned to','Status / due'],data.tasks.map((task)=>[task.title,task.assigned_profile?.full_name || 'Unassigned',`${title(task.status)}\n${date(task.due_date)}`]),['50%','23%','27%']);
    section('Internal notes & follow-up');
    pairs([['Priority',title(c.priority)],['Case description',c.description],['Internal notes',c.notes],['Delay reason',c.flag_reason],['Follow-up date',date(c.follow_up_date)]]);
    if(data.activities.length){
      section('Recent activity');
      content.push({text:'Most recent 20 updates',fontSize:8,color:'#64748B',margin:[0,0,0,6]});
      table(['Date','Update'],data.activities.slice(0,20).map((activity)=>[date(activity.created_at),activity.description || title(activity.action)]),['23%','77%']);
    }
  } else {
    content.push({text:c.status==='closed'||c.status==='completed'?'This case is recorded as closed.':`The case is currently at ${getCaseStatusLabel(c.status)}. Your assigned representative can confirm the next action and expected timeline.`,color:'#475569',lineHeight:1.3});
  }
  const generated = new Intl.DateTimeFormat('en-IN',{dateStyle:'medium',timeStyle:'short',timeZone:'Asia/Kolkata'}).format(now);
  return {
    pageSize:'A4',pageMargins:[42,42,42,48],defaultStyle:{font:'Roboto',fontSize:10,color:ink},
    info:{title:`${c.case_number} — Case Update`,author:'CRM',subject:internal?'Internal case report':'Client case update'},
    styles:{section:{fontSize:10,bold:true,color:teal,characterSpacing:1}},content,
    pageBreakBefore:(node,queries)=>node.headlineLevel===1 && queries.getFollowingNodesOnPage().length===0,
    footer:(page,pages)=>({columns:[{text:`${c.case_number} • ${internal?'Internal report':'Client update'}\nGenerated ${generated} IST`,fontSize:7,color:'#64748B'},{text:`${page} / ${pages}`,fontSize:8,alignment:'right',color:'#64748B'}],margin:[42,10,42,0]}),
  };
}

export async function createCasePdf(data: CaseReportData, internal: boolean) {
  const [{default:pdfMake},{default:fonts}] = await Promise.all([import('pdfmake/build/pdfmake'),import('pdfmake/build/vfs_fonts')]);
  pdfMake.addVirtualFileSystem(fonts);
  return pdfMake.createPdf(buildCasePdfDefinition(data,internal));
}
