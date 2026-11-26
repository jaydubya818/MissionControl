// Test entry only. Real Convex transport; disposable synthetic identity, never Clerk qualification.
import React from 'react';
import {createRoot} from 'react-dom/client';
import {ConvexProvider,ConvexReactClient} from 'convex/react';
import {BrowserRouter,useLocation,useNavigate} from 'react-router-dom';
import {AuthRuntimeProvider} from '../../src/auth/AuthRuntimeContext';
import {SofieOwnerReview} from '../../src/eos/views/SofieOwnerReview';
import {MissionDetailView} from '../../src/eos/views/MissionDetailView';
import {FactoryOverviewView} from '../../src/controlPlane/FactoryOverviewView';
import '../checkpoint-h/style.css';
const config=await fetch('/__local_owner_session',{cache:'no-store'}).then(r=>{if(!r.ok)throw Error('Disposable session unavailable');return r.json();});
if(!/^http:\/\/127\.0\.0\.1:\d+$/.test(config.url))throw Error('Only loopback backend allowed');
const client=new ConvexReactClient(config.url);
client.setAdminAuth(config.key,{subject:config.subject,issuer:'https://fixture.example.test',email:config.subject+'@example.test'});
function Views(){const location=useLocation(),navigate=useNavigate();
 const go=(view:string)=>navigate('/v2/'+view+'?workspace='+encodeURIComponent(config.projectId));
 return <main className="min-h-screen bg-app p-4 text-ink"><p role="status">Disposable local qualification. Synthetic owner session; hosted Clerk not qualified.</p><nav aria-label="Local qualification navigation"><button onClick={()=>go('dashboard')}>Dashboard</button><button onClick={()=>go('missions')}>Missions</button></nav>{location.pathname==='/v2/dashboard'?<FactoryOverviewView projectId={config.projectId} onNavigate={go}/>:location.pathname.startsWith('/v2/missions/')?<MissionDetailView projectId={config.projectId} onNavigate={go}/>:<SofieOwnerReview projectId={config.projectId}/>}</main>;
}
createRoot(document.getElementById('root')!).render(<ConvexProvider client={client}><AuthRuntimeProvider value={{mode:'clerk'}}><BrowserRouter><Views/></BrowserRouter></AuthRuntimeProvider></ConvexProvider>);
