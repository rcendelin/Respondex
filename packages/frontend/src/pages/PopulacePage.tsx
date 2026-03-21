import { Users } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card'

export function PopulacePage() {
  return (
    <div className="p-8">
      <div className="flex items-center gap-3 mb-6">
        <Users className="h-6 w-6" />
        <h2 className="text-2xl font-bold">Populace</h2>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Správa populací</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">Blok 18 — implementace v přípravě.</p>
        </CardContent>
      </Card>
    </div>
  )
}
