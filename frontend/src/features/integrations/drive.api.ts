import { api } from "@/shared/api/client"

export interface DriveConfigStatus {
  configured: boolean
  is_active: boolean
  hints: Partial<Record<"client_id" | "client_secret" | "refresh_token" | "takes_folder_id" | "projects_folder_id", string>>
  updated_at: string | null
  can_configure?: boolean
}

export async function getDriveConfig(workspaceId: string): Promise<DriveConfigStatus> {
  const { data } = await api.get<DriveConfigStatus>("/integrations/drive/config/", {
    params: { workspace_id: workspaceId },
  })
  return data
}

export async function saveDriveConfig(
  workspaceId: string,
  values: Record<string, string | boolean>,
): Promise<DriveConfigStatus> {
  const { data } = await api.put<DriveConfigStatus>("/integrations/drive/config/", {
    workspace_id: workspaceId,
    ...values,
  })
  return data
}

export async function testDriveConfig(workspaceId: string): Promise<{
  ok: boolean
  error?: string
  takes_folder?: string
  projects_folder?: string
}> {
  const { data } = await api.post("/integrations/drive/config/test/", { workspace_id: workspaceId })
  return data
}

export interface DriveFile {
  id: string
  name: string
  mimeType: string
  size?: string
  modifiedTime?: string
  thumbnailLink?: string
}

export async function listDriveFiles(
  workspaceId: string,
  library: "takes" | "projects",
  options: { folderId?: string; search?: string } = {},
): Promise<DriveFile[]> {
  const { data } = await api.get<{ files: DriveFile[] }>(`/integrations/drive/${library}/`, {
    params: { workspace_id: workspaceId, ...(options.folderId ? { folder_id: options.folderId } : {}), ...(options.search ? { search: options.search } : {}) },
  })
  return data.files
}

export async function listDriveDays(workspaceId: string, month?: string): Promise<DriveFile[]> {
  const { data } = await api.get<{ days: DriveFile[] }>("/integrations/drive/days/", { params: { workspace_id: workspaceId, ...(month ? { month } : {}) } })
  return data.days
}

export async function createDriveUploadSession(
  workspaceId: string,
  library: "takes" | "projects",
  file: File,
  date?: string,
): Promise<{ upload_url: string }> {
  const { data } = await api.post<{ upload_url: string }>(`/integrations/drive/uploads/${library}/`, {
    workspace_id: workspaceId, name: file.name, mime_type: file.type || "application/octet-stream", size: file.size, ...(date ? { date } : {}),
  })
  return data
}

export async function uploadDriveFile(url: string, file: File, onProgress: (percent: number) => void): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open("PUT", url)
    xhr.setRequestHeader("Content-Type", file.type || "application/octet-stream")
    xhr.upload.onprogress = (event) => { if (event.lengthComputable) onProgress(Math.round((event.loaded / event.total) * 100)) }
    xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error("upload failed")))
    xhr.onerror = () => reject(new Error("upload failed"))
    xhr.send(file)
  })
}

export async function trashDriveTake(workspaceId: string, fileId: string): Promise<void> {
  await api.delete(`/integrations/drive/takes/${fileId}/`, { params: { workspace_id: workspaceId } })
}

export async function getDrivePublicUrl(workspaceId: string, fileId: string): Promise<string> {
  const { data } = await api.post<{ url: string }>(`/integrations/drive/files/${fileId}/public-url/`, { workspace_id: workspaceId })
  return data.url
}

export async function openDriveFile(workspaceId: string, fileId: string, mode: "preview" | "download" = "preview"): Promise<void> {
  const response = await api.get(`/integrations/drive/files/${fileId}/${mode}/`, {
    params: { workspace_id: workspaceId }, responseType: "blob",
  })
  const url = URL.createObjectURL(response.data as Blob)
  if (mode === "download") {
    const link = document.createElement("a")
    link.href = url
    link.download = ""
    link.click()
    URL.revokeObjectURL(url)
  } else {
    window.open(url, "_blank", "noopener,noreferrer")
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000)
  }
}
