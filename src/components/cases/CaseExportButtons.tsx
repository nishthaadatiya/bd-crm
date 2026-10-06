'use client';

import { useRef, useState } from 'react';
import { Download } from 'lucide-react';
import Button from '@/components/ui/Button';
import Modal from '@/components/ui/Modal';
import Select from '@/components/ui/Select';
import { useToast } from '@/components/ui/Toast';
import { createClient } from '@/lib/supabase/client';
import { downloadBlob, loadAllCases, loadCaseReport, safeFilename } from '@/lib/case-export-data';

export function AllCasesExcelButton() {
  const [loading,setLoading]=useState(false);
  const busy=useRef(false);
  const {toast}=useToast();
  async function download(){
    if(busy.current)return;busy.current=true;setLoading(true);
    try{
      const cases=await loadAllCases(createClient());
      const {buildCasesWorkbook}=await import('@/lib/case-excel');
      const workbook=await buildCasesWorkbook(cases);
      const buffer=await workbook.xlsx.writeBuffer();
      downloadBlob(new Blob([new Uint8Array(buffer)],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}),`All_Cases_${new Date().toISOString().slice(0,10)}.xlsx`);
      toast(`Exported ${cases.length} cases to Excel`,'success');
    }catch(error){toast(error instanceof Error?error.message:'Could not export cases','error');}
    finally{busy.current=false;setLoading(false);}
  }
  return <Button variant="secondary" onClick={download} isLoading={loading}><Download className="h-4 w-4"/>Download All Cases (Excel)</Button>;
}

export function CasePdfButton({caseId}:{caseId:string}){
  const [open,setOpen]=useState(false);
  const [audience,setAudience]=useState('client');
  const [loading,setLoading]=useState(false);
  const busy=useRef(false);
  const {toast}=useToast();
  async function download(){
    if(busy.current)return;busy.current=true;setLoading(true);
    try{
      const internal=audience==='internal';
      const data=await loadCaseReport(createClient(),caseId,internal);
      const {createCasePdf}=await import('@/lib/case-pdf');
      const pdf=await createCasePdf(data,internal);
      await pdf.download(`${safeFilename(data.caseData.case_number)}_${internal?'Internal_Report':'Client_Update'}.pdf`);
      toast('Case PDF downloaded','success');setOpen(false);
    }catch(error){toast(error instanceof Error?error.message:'Could not generate PDF','error');}
    finally{busy.current=false;setLoading(false);}
  }
  return <>
    <Button variant="secondary" onClick={()=>setOpen(true)}><Download className="h-4 w-4"/>Download PDF</Button>
    <Modal isOpen={open} onClose={()=>{if(!busy.current)setOpen(false);}} title="Download case report">
      <div className="space-y-4">
        <Select id="report-audience" label="Who is this report for?" value={audience} disabled={loading} onChange={(event)=>setAudience(event.target.value)} options={[{value:'client',label:'Client update'},{value:'internal',label:'Boss / internal report'}]}/>
        <p className="text-sm text-slate-400">{audience==='client'?'A shareable update with case progress, loan details, document status and a work summary. Internal notes and activity history are excluded.':'Includes task details, internal notes, delay reasons and the latest 20 activity updates. Intended for internal sharing.'}</p>
        <div className="flex justify-end gap-2"><Button variant="secondary" disabled={loading} onClick={()=>setOpen(false)}>Cancel</Button><Button onClick={download} isLoading={loading}>Download PDF</Button></div>
      </div>
    </Modal>
  </>;
}
