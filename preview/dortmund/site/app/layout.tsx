import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata = {title:'FreiFahren Dortmund',description:'Dortmunder Haltestellen, Linien und private Testmeldungen.'};
export default function RootLayout({children}:{children:React.ReactNode}) {return <html lang="de"><body style={{margin:0}}>{children}</body></html>;}
