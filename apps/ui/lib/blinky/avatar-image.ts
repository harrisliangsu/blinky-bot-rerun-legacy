const MAX_IMAGE_CHARS = 120_000

export function readAvatarFile(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader()
        reader.onerror = () => reject(new Error('Could not read that image'))
        reader.onload = () => {
            const source = new Image()
            source.onerror = () => reject(new Error('Could not read that image'))
            source.onload = () => {
                const size = 96
                const canvas = document.createElement('canvas')
                canvas.width = size
                canvas.height = size
                const ctx = canvas.getContext('2d')
                if (!ctx) {
                    reject(new Error('Could not read that image'))
                    return
                }
                const scale = Math.max(size / source.width, size / source.height)
                const width = source.width * scale
                const height = source.height * scale
                ctx.drawImage(source, (size - width) / 2, (size - height) / 2, width, height)
                const url = canvas.toDataURL('image/jpeg', 0.72)
                if (url.length > MAX_IMAGE_CHARS) {
                    reject(new Error('That image is still too large'))
                    return
                }
                resolve(url)
            }
            source.src = String(reader.result ?? '')
        }
        reader.readAsDataURL(file)
    })
}
