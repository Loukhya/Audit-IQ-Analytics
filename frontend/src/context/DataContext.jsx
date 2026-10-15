import React, { createContext, useState, useContext } from 'react';

const DataContext = createContext();

export function DataProvider({ children }) {
    const [dataLoaded, setDataLoaded] = useState(false);
    const [dataStats, setDataStats] = useState(null);
    const [previewData, setPreviewData] = useState([]);
    const [modulesCompleted, setModulesCompleted] = useState(0);

    return (
        <DataContext.Provider
            value={{
                dataLoaded,
                setDataLoaded,
                dataStats,
                setDataStats,
                previewData,
                setPreviewData,
                modulesCompleted,
                setModulesCompleted,
            }}
        >
            {children}
        </DataContext.Provider>
    );
}

export function useData() {
    return useContext(DataContext);
}

export default DataContext;
