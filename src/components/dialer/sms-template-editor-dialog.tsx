'use client'

import { useState, useEffect } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { RotateCcw } from 'lucide-react'
import {
  DEFAULT_SMS_TEMPLATES,
  loadSmsTemplates,
  saveSmsTemplates,
  resolveTemplate,
} from '@/hooks/use-power-dialer'
import type { PowerDialerLead } from '@/types/schema'

interface SMSTemplateEditorDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

const SAMPLE_LEAD: PowerDialerLead = {
  propertyId: 'sample',
  address: '123 Main St',
  city: 'Tampa',
  state: 'FL',
  zip: '33601',
  ownerName: 'John Smith',
  ownerPhone: null,
  contactId: null,
  contactPhones: null,
  dialStatus: 'pending',
}

export function SMSTemplateEditorDialog({ open, onOpenChange }: SMSTemplateEditorDialogProps) {
  const [templates, setTemplates] = useState<string[]>(DEFAULT_SMS_TEMPLATES)
  const [previewIndex, setPreviewIndex] = useState<number | null>(null)

  useEffect(() => {
    if (open) {
      setTemplates(loadSmsTemplates())
      setPreviewIndex(null)
    }
  }, [open])

  const updateTemplate = (index: number, value: string) => {
    const updated = [...templates]
    updated[index] = value
    setTemplates(updated)
  }

  const resetToDefaults = () => {
    setTemplates([...DEFAULT_SMS_TEMPLATES])
  }

  const handleSave = () => {
    saveSmsTemplates(templates)
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>SMS Templates</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Variable reference */}
          <div className="flex flex-wrap gap-1.5">
            <span className="text-xs text-muted-foreground">Variables:</span>
            {['{owner_name}', '{address}', '{city}', '{state}', '{zip}'].map(v => (
              <Badge key={v} variant="secondary" className="text-xs font-mono">
                {v}
              </Badge>
            ))}
          </div>

          {/* Templates */}
          {templates.map((template, index) => (
            <div key={index} className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium">Template {index + 1}</label>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-xs h-6 px-2"
                  onClick={() => setPreviewIndex(previewIndex === index ? null : index)}
                >
                  {previewIndex === index ? 'Hide Preview' : 'Preview'}
                </Button>
              </div>
              <Textarea
                value={template}
                onChange={(e) => updateTemplate(index, e.target.value)}
                className="min-h-[80px] text-sm"
                placeholder="Enter SMS template..."
              />
              {previewIndex === index && (
                <div className="p-3 rounded-lg bg-blue-50 dark:bg-blue-950/30 border border-blue-100 dark:border-blue-900/50">
                  <p className="text-xs text-muted-foreground mb-1">Preview with sample data:</p>
                  <p className="text-sm text-blue-700 dark:text-blue-300">
                    {resolveTemplate(template, SAMPLE_LEAD)}
                  </p>
                </div>
              )}
            </div>
          ))}
        </div>

        <DialogFooter className="flex items-center justify-between sm:justify-between">
          <Button variant="ghost" size="sm" onClick={resetToDefaults} className="gap-1.5">
            <RotateCcw className="h-3.5 w-3.5" />
            Reset Defaults
          </Button>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button onClick={handleSave}>
              Save Templates
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
