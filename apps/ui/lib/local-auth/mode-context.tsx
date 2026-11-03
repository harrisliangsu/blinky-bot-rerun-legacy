'use client'

import { createContext, useContext, type PropsWithChildren } from 'react'

const LocalAuthContext = createContext(false)

export function LocalAuthMode({ children }: PropsWithChildren) {
    return <LocalAuthContext.Provider value={true}>{children}</LocalAuthContext.Provider>
}

export function useLocalAuthMode(): boolean {
    return useContext(LocalAuthContext)
}
