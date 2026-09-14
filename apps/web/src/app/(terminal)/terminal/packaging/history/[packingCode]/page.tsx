import PackingRecordDetail from '@/components/packaging/PackingRecordDetail';
export default async function Page({params}:{params:Promise<{packingCode:string}>}){const {packingCode}=await params;return <PackingRecordDetail packingCode={packingCode}/>;}
