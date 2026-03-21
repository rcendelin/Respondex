import { BarChart2 } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card'

export function VysledkyPage() {
  return (
    <div className="p-8">
      <div className="flex items-center gap-3 mb-6">
        <BarChart2 className="h-6 w-6" />
        <h2 className="text-2xl font-bold">Výsledky</h2>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Analýza výsledků</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">Blok 20 — implementace v přípravě.</p>
        </CardContent>
      </Card>
    </div>
  )
}
