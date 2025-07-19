// logger.js - Centralized logging system for debugging

class Logger {
    constructor() {
        this.logs = [];
        this.maxLogs = 1000;
        this.logLevels = {
            DEBUG: 0,
            INFO: 1,
            WARN: 2,
            ERROR: 3
        };
        this.currentLevel = this.logLevels.DEBUG;
        this.listeners = [];
    }

    log(level, component, message, data = null) {
        const timestamp = new Date().toISOString();
        const entry = {
            timestamp,
            level,
            component,
            message,
            data: data ? this.sanitizeData(data) : null
        };

        // Console output with color coding
        const colors = {
            DEBUG: 'color: #888',
            INFO: 'color: #2196F3',
            WARN: 'color: #FF9800',
            ERROR: 'color: #F44336'
        };

        console.log(
            `%c[${timestamp}] [${level}] [${component}] ${message}`,
            colors[level],
            data || ''
        );

        // Store in memory
        this.logs.push(entry);
        if (this.logs.length > this.maxLogs) {
            this.logs.shift();
        }

        // Notify listeners
        this.notifyListeners(entry);

        // Send to service worker if needed
        if (chrome.runtime && chrome.runtime.sendMessage) {
            chrome.runtime.sendMessage({
                type: 'LOG_ENTRY',
                entry
            }).catch(() => {
                // Ignore errors when service worker is not ready
            });
        }
    }

    sanitizeData(data) {
        try {
            // Remove any sensitive information
            const str = JSON.stringify(data);
            return JSON.parse(str.replace(/api_key":\s*"[^"]+"/gi, 'api_key":"***"'));
        } catch (e) {
            return String(data);
        }
    }

    debug(component, message, data) {
        if (this.currentLevel <= this.logLevels.DEBUG) {
            this.log('DEBUG', component, message, data);
        }
    }

    info(component, message, data) {
        if (this.currentLevel <= this.logLevels.INFO) {
            this.log('INFO', component, message, data);
        }
    }

    warn(component, message, data) {
        if (this.currentLevel <= this.logLevels.WARN) {
            this.log('WARN', component, message, data);
        }
    }

    error(component, message, data) {
        if (this.currentLevel <= this.logLevels.ERROR) {
            this.log('ERROR', component, message, data);
        }
    }

    addListener(callback) {
        this.listeners.push(callback);
    }

    removeListener(callback) {
        this.listeners = this.listeners.filter(l => l !== callback);
    }

    notifyListeners(entry) {
        this.listeners.forEach(listener => {
            try {
                listener(entry);
            } catch (e) {
                console.error('Logger listener error:', e);
            }
        });
    }

    getLogs(filter = {}) {
        let filteredLogs = [...this.logs];

        if (filter.level) {
            const minLevel = this.logLevels[filter.level];
            filteredLogs = filteredLogs.filter(log => 
                this.logLevels[log.level] >= minLevel
            );
        }

        if (filter.component) {
            filteredLogs = filteredLogs.filter(log => 
                log.component.includes(filter.component)
            );
        }

        if (filter.search) {
            filteredLogs = filteredLogs.filter(log => 
                log.message.toLowerCase().includes(filter.search.toLowerCase()) ||
                (log.data && JSON.stringify(log.data).toLowerCase().includes(filter.search.toLowerCase()))
            );
        }

        return filteredLogs;
    }

    exportLogs() {
        const logs = this.getLogs();
        const exportData = {
            exportTime: new Date().toISOString(),
            extensionVersion: chrome.runtime.getManifest().version,
            userAgent: navigator.userAgent,
            logs
        };

        const blob = new Blob([JSON.stringify(exportData, null, 2)], {
            type: 'application/json'
        });

        const url = URL.createObjectURL(blob);
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        
        return {
            url,
            filename: `meet-transcription-logs-${timestamp}.json`
        };
    }

    clear() {
        this.logs = [];
        this.info('Logger', 'Logs cleared');
    }

    // Performance tracking
    startTimer(label) {
        return {
            label,
            start: performance.now()
        };
    }

    endTimer(timer) {
        const duration = performance.now() - timer.start;
        this.debug('Performance', `${timer.label} took ${duration.toFixed(2)}ms`, { duration });
        return duration;
    }
}

// Create global logger instance
window.logger = new Logger();

// Log extension initialization
window.logger.info('Extension', 'Logger initialized', {
    manifest: chrome.runtime.getManifest().version,
    url: window.location.href
});