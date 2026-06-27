import { api } from "@/shared/api/client"

import type { CardPriority, CardType } from "@/features/workspace/workspace.types"

export interface SuggestedTask {
  title: string
  description: string
  priority: CardPriority
  type: CardType
}

export interface Analysis {
  summary: string
  tasks: SuggestedTask[]
  decisions: string[]
  risks: string[]
}

export interface CopilotDocument {
  id: string
  title: string
  kind: string
  status: string
  text_preview: string
  analysis: Analysis | null
}

export type DocKind = "text" | "pdf" | "docx" | "audio"

// Importa texto colado.
export async function ingestText(
  workspaceId: string,
  title: string,
  text: string,
): Promise<CopilotDocument> {
  const { data } = await api.post<CopilotDocument>("/copilot/documents/", {
    workspace_id: workspaceId,
    title,
    kind: "text",
    text,
  })
  return data
}

// Importa um arquivo (PDF/DOCX/áudio) via multipart.
export async function ingestFile(
  workspaceId: string,
  title: string,
  kind: DocKind,
  file: File,
): Promise<CopilotDocument> {
  const form = new FormData()
  form.append("workspace_id", workspaceId)
  form.append("title", title)
  form.append("kind", kind)
  form.append("file", file)
  const { data } = await api.post<CopilotDocument>("/copilot/documents/", form, {
    headers: { "Content-Type": "multipart/form-data" },
  })
  return data
}

export async function analyzeDocument(documentId: string): Promise<Analysis> {
  const { data } = await api.post<Analysis>(`/copilot/documents/${documentId}/analyze/`)
  return data
}

export async function createTasksFromDocument(
  documentId: string,
  projectId: string,
  tasks: SuggestedTask[],
): Promise<{ created: { id: string; ref: string; title: string }[] }> {
  const { data } = await api.post(`/copilot/documents/${documentId}/create-tasks/`, {
    project_id: projectId,
    tasks,
  })
  return data
}
