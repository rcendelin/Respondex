import { BlobServiceClient, StorageSharedKeyCredential } from '@azure/storage-blob'

/**
 * Thin wrapper over Azure Blob Storage SDK.
 * All paths are relative to the storage account root (container/blob format: "container/path/to/blob").
 * The first path segment is treated as the container name.
 */
export class BlobStorageService {
  private readonly client: BlobServiceClient

  constructor() {
    const connectionString = process.env['AZURE_STORAGE_CONNECTION_STRING']
    if (!connectionString) {
      throw new Error('AZURE_STORAGE_CONNECTION_STRING environment variable is not set')
    }
    this.client = BlobServiceClient.fromConnectionString(connectionString)
  }

  /** Split "container/rest/of/path" into { container, blobPath } */
  private splitPath(path: string): { container: string; blobPath: string } {
    const slashIndex = path.indexOf('/')
    if (slashIndex === -1) throw new Error(`Invalid blob path (missing container): "${path}"`)
    return {
      container: path.substring(0, slashIndex),
      blobPath: path.substring(slashIndex + 1),
    }
  }

  private containerClient(containerName: string) {
    return this.client.getContainerClient(containerName)
  }

  async readJson<T>(path: string): Promise<T> {
    const { container, blobPath } = this.splitPath(path)
    const blobClient = this.containerClient(container).getBlobClient(blobPath)
    const download = await blobClient.download()
    const chunks: Buffer[] = []
    for await (const chunk of download.readableStreamBody ?? []) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as unknown as ArrayBuffer))
    }
    const text = Buffer.concat(chunks).toString('utf-8')
    return JSON.parse(text) as T
  }

  async writeJson<T>(path: string, data: T): Promise<void> {
    const { container, blobPath } = this.splitPath(path)
    const content = JSON.stringify(data, null, 2)
    const buffer = Buffer.from(content, 'utf-8')
    const blockBlobClient = this.containerClient(container).getBlockBlobClient(blobPath)
    await blockBlobClient.upload(buffer, buffer.length, {
      blobHTTPHeaders: { blobContentType: 'application/json; charset=utf-8' },
    })
  }

  async uploadBlob(path: string, buffer: Buffer): Promise<void> {
    const { container, blobPath } = this.splitPath(path)
    const blockBlobClient = this.containerClient(container).getBlockBlobClient(blobPath)
    await blockBlobClient.upload(buffer, buffer.length)
  }

  async downloadBlob(path: string): Promise<Buffer> {
    const { container, blobPath } = this.splitPath(path)
    const blobClient = this.containerClient(container).getBlobClient(blobPath)
    const download = await blobClient.download()
    const chunks: Buffer[] = []
    for await (const chunk of download.readableStreamBody ?? []) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as unknown as ArrayBuffer))
    }
    return Buffer.concat(chunks)
  }

  async listBlobs(prefix: string): Promise<string[]> {
    const { container, blobPath } = this.splitPath(prefix)
    const containerClient = this.containerClient(container)
    const results: string[] = []
    for await (const blob of containerClient.listBlobsFlat({ prefix: blobPath })) {
      results.push(`${container}/${blob.name}`)
    }
    return results
  }

  async deleteBlob(path: string): Promise<void> {
    const { container, blobPath } = this.splitPath(path)
    const blobClient = this.containerClient(container).getBlobClient(blobPath)
    await blobClient.deleteIfExists()
  }

  async blobExists(path: string): Promise<boolean> {
    const { container, blobPath } = this.splitPath(path)
    const blobClient = this.containerClient(container).getBlobClient(blobPath)
    return blobClient.exists()
  }

  /** Delete all blobs with a given prefix (simulates folder deletion) */
  async deletePrefix(prefix: string): Promise<void> {
    const paths = await this.listBlobs(prefix)
    await Promise.all(paths.map((p) => this.deleteBlob(p)))
  }
}
