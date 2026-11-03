import type { BotLocale } from './locale'

const COPY = {
    en: {
        bots: 'Bots',
        newBot: 'New Bot',
        editBot: 'Edit Bot',
        save: 'Save',
        create: 'Create Bot',
        cancel: 'Cancel',
        delete: 'Delete Bot',
        deleteTitle: 'Delete this Bot?',
        deleteBody: 'This permanently deletes the Bot and its chats, memory, skills, and workspace on this Mac. This cannot be undone.',
        deleteType: 'Type the name to confirm.',
        name: 'Name',
        persona: 'Persona',
        personaHint: 'Instructions this Bot follows in every chat.',
        model: 'Default model',
        modelDefault: 'Box default',
        modelEmpty: 'No model connected yet. The Bot follows the Box default.',
        avatar: 'Avatar',
        avatarEmoji: 'Emoji',
        avatarImage: 'Image',
        avatarClear: 'Remove image',
        language: 'Language',
        empty: 'No Bots yet. Create one to start a chat.',
        whatShouldNew: 'What should your new Bot do?',
        renameTitle: 'Rename Bot',
        renameBody: 'The name shown in the list and in chats. Its @handle follows.',
        rename: 'Rename',
        notifications: 'Bots',
        notificationsBody: 'What is worth interrupting you for. Saved as you go.',
        chooseBot: 'Choose a Bot',
        perBot: 'Per Bot',
        perBotDetail: 'Also set from the bell on each Bot.',
        everyListed: 'Every Bot is already listed',
        everyFollows: 'Every Bot follows the rule above.',
        settingsInactive: 'This Bot is inactive, so its configuration cannot be loaded or changed.',
        engineDown: 'Could not reach the engine for this Bot.',
        placeBot: 'Tap a tile to place your Bot',
        mainBot: 'Main Bot',
        saved: 'Saved',
        saveFailed: 'Could not save this Bot',
        createFailed: 'Could not create this Bot',
    },
    zh: {
        bots: 'Bot',
        newBot: '新建 Bot',
        editBot: '编辑 Bot',
        save: '保存',
        create: '创建 Bot',
        cancel: '取消',
        delete: '删除 Bot',
        deleteTitle: '删除这个 Bot？',
        deleteBody: '这会永久删除该 Bot，以及它在这台 Mac 上的对话、记忆、技能和工作区。此操作无法撤销。',
        deleteType: '输入名称以确认。',
        name: '名称',
        persona: '人设',
        personaHint: '这个 Bot 在每次对话里遵循的说明。',
        model: '默认模型',
        modelDefault: '跟随默认',
        modelEmpty: '还没有连接模型。Bot 会跟随默认设置。',
        avatar: '头像',
        avatarEmoji: '表情',
        avatarImage: '图片',
        avatarClear: '移除图片',
        language: '语言',
        empty: '还没有 Bot。创建一个，然后开始对话。',
        whatShouldNew: '你的新 Bot 要做什么？',
        renameTitle: '重命名 Bot',
        renameBody: '列表和对话里显示的名称。@handle 会跟着改。',
        rename: '重命名',
        notifications: 'Bot',
        notificationsBody: '哪些事值得打断你。修改会立即保存。',
        chooseBot: '选择一个 Bot',
        perBot: '按 Bot',
        perBotDetail: '也可以在每个 Bot 的铃铛里设置。',
        everyListed: '每个 Bot 都已列出',
        everyFollows: '每个 Bot 都遵循上面的规则。',
        settingsInactive: '这个 Bot 已停用，无法加载或修改它的配置。',
        engineDown: '无法连接这个 Bot 的引擎。',
        placeBot: '点一块格子来放置你的 Bot',
        mainBot: '主 Bot',
        saved: '已保存',
        saveFailed: '没能保存这个 Bot',
        createFailed: '没能创建这个 Bot',
    },
} as const

export type BotCopy = { [K in keyof (typeof COPY)['en']]: string }

export function botCopy(locale: BotLocale): BotCopy {
    return COPY[locale]
}

export function whatShouldBotDo(locale: BotLocale, name: string): string {
    if (!name) return COPY[locale].whatShouldNew
    return locale === 'zh' ? `${name} 要做什么？` : `What should ${name} do?`
}

export function placementProgress(locale: BotLocale, index: number, total: number): string {
    return locale === 'zh' ? `Bot ${index} / ${total}` : `Bot ${index} of ${total}`
}
