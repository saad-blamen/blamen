class BudgetStorage {
    constructor(calculator) {
        this.calculator = calculator;
        this.lastSavedState = '';
        this.autoSaveInterval = 30000; // Auto-save every 30 seconds
        this.pendingSave = false;
        this.initializeControls();
        this.setupAutoSave();
    }

    initializeControls() {
        document.getElementById('save-btn').addEventListener('click', () => this.saveData(true));
        document.getElementById('export-btn').addEventListener('click', () => this.exportToCSV());
        document.getElementById('import-btn').addEventListener('click', () => document.getElementById('import-input').click());
        document.getElementById('import-input').addEventListener('change', (e) => this.importFromCSV(e.target.files[0]));

        // Listen for input changes to trigger auto-save
        ['income-inputs', 'expense-inputs'].forEach(id => {
            const container = document.getElementById(id);
            if (container) {
                container.addEventListener('input', () => this.scheduleAutoSave());
            }
        });

        // Load saved data on startup
        this.loadData();
    }

    setupAutoSave() {
        setInterval(() => {
            if (this.pendingSave) {
                this.saveData(false);
                this.pendingSave = false;
            }
        }, this.autoSaveInterval);
    }

    scheduleAutoSave() {
        this.pendingSave = true;
    }

    saveData(showNotification = true) {
        try {
            const data = {
                income: this.getEntriesData(this.calculator.incomeInputs),
                expenses: this.getEntriesData(this.calculator.expenseInputs),
                currency: this.calculator.selectedCurrency,
                timestamp: new Date().toISOString()
            };

            const dataString = JSON.stringify(data);
            if (dataString === this.lastSavedState) {
                return;
            }

            localStorage.setItem('budgetData', dataString);
            this.lastSavedState = dataString;

            if (showNotification) {
                this.showNotification('Data saved successfully', 'success');
            }

            // Update save status indicator
            const saveStatus = document.getElementById('save-status');
            if (saveStatus) {
                saveStatus.classList.add('show');
                setTimeout(() => saveStatus.classList.remove('show'), 2000);
            }
        } catch (error) {
            console.error('Error saving data:', error);
            this.showNotification('Failed to save data', 'error');
        }
    }

    loadData() {
        try {
            const saved = localStorage.getItem('budgetData');
            if (saved) {
                const data = JSON.parse(saved);
                this.calculator.selectedCurrency = data.currency;
                this.calculator.currencySelect.value = data.currency;
                this.loadEntries(this.calculator.incomeInputs, data.income);
                this.loadEntries(this.calculator.expenseInputs, data.expenses);
                this.calculator.updateCalculations();
                this.lastSavedState = saved;
                this.showNotification('Data loaded successfully', 'success');
            }
        } catch (error) {
            console.error('Error loading data:', error);
            this.showNotification('Failed to load data', 'error');
        }
    }

    exportToCSV() {
        try {
            const income = this.getEntriesData(this.calculator.incomeInputs);
            const expenses = this.getEntriesData(this.calculator.expenseInputs);

            if (!income.length && !expenses.length) {
                throw new Error('No data to export');
            }

            const rows = [
                ['Type', 'Label', 'Amount', 'Currency']
            ];

            income.forEach(item => {
                rows.push(['Income', this.escapeCSV(item.label), item.amount.toFixed(2), this.calculator.selectedCurrency]);
            });

            expenses.forEach(item => {
                rows.push(['Expense', this.escapeCSV(item.label), item.amount.toFixed(2), this.calculator.selectedCurrency]);
            });

            const csv = rows.map(row => row.join(',')).join('\n');
            const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            const timestamp = new Date().toISOString().split('T')[0];
            a.href = url;
            a.download = `budget_${timestamp}.csv`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);

            this.showNotification('Data exported successfully', 'success');
        } catch (error) {
            console.error('Error exporting data:', error);
            this.showNotification(error.message || 'Failed to export data', 'error');
        }
    }

    async importFromCSV(file) {
        if (!file) return;

        try {
            if (!file.name.endsWith('.csv') && file.type !== 'text/csv') {
                throw new Error('Please select a valid CSV file');
            }

            const text = await file.text();
            const rows = text.split('\n').slice(1); // Skip header
            const income = [];
            const expenses = [];

            rows.forEach((row, index) => {
                if (!row.trim()) return;
                const [type, label, amount] = row.split(',').map(s => s.trim());
                
                if (!type || !label || !amount) {
                    throw new Error(`Invalid data in row ${index + 2}`);
                }

                const parsedAmount = parseFloat(amount);
                if (isNaN(parsedAmount) || parsedAmount <= 0) {
                    throw new Error(`Invalid amount in row ${index + 2}`);
                }

                const entry = { label: this.unescapeCSV(label), amount: parsedAmount };
                if (type.toLowerCase() === 'income') {
                    income.push(entry);
                } else if (type.toLowerCase() === 'expense') {
                    expenses.push(entry);
                } else {
                    throw new Error(`Invalid type "${type}" in row ${index + 2}`);
                }
            });

            this.loadEntries(this.calculator.incomeInputs, income);
            this.loadEntries(this.calculator.expenseInputs, expenses);
            this.calculator.updateCalculations();
            this.saveData(false);
            this.showNotification('Data imported successfully', 'success');
        } catch (error) {
            console.error('Error importing data:', error);
            this.showNotification(error.message || 'Failed to import data', 'error');
        } finally {
            document.getElementById('import-input').value = '';
        }
    }

    getEntriesData(container) {
        return Array.from(container.querySelectorAll('.input-group'))
            .map(group => {
                const label = group.querySelector('.label-input').value.trim();
                const amount = parseFloat(group.querySelector('.amount-input').value) || 0;
                return { label, amount };
            })
            .filter(entry => entry.label && entry.amount > 0);
    }

    loadEntries(container, entries) {
        // Clear existing entries except first one
        Array.from(container.querySelectorAll('.input-group:not(:first-child)'))
            .forEach(group => group.remove());

        if (entries && entries.length > 0) {
            // Update first entry
            const firstGroup = container.querySelector('.input-group');
            firstGroup.querySelector('.label-input').value = entries[0].label;
            firstGroup.querySelector('.amount-input').value = entries[0].amount.toFixed(2);

            // Add remaining entries
            entries.slice(1).forEach(entry => {
                const group = document.createElement('div');
                group.className = 'input-group';
                group.innerHTML = `
                    <input type="text" class="label-input" value="${this.escapeHtml(entry.label)}" placeholder="Label">
                    <input type="number" class="amount-input" value="${entry.amount.toFixed(2)}" placeholder="Amount">
                    <button class="delete-entry">×</button>
                `;
                container.appendChild(group);

                group.querySelector('.delete-entry').addEventListener('click', () => {
                    group.remove();
                    this.calculator.updateCalculations();
                    this.scheduleAutoSave();
                });
            });
        }
    }

    showNotification(message, type) {
        const notification = document.createElement('div');
        notification.className = `notification ${type}`;
        notification.textContent = message;
        document.body.appendChild(notification);

        setTimeout(() => {
            notification.style.opacity = '0';
            setTimeout(() => notification.remove(), 300);
        }, 2000);
    }

    escapeCSV(str) {
        if (typeof str !== 'string') return str;
        if (str.includes('"') || str.includes(',') || str.includes('\n')) {
            return `"${str.replace(/"/g, '""')}"`;
        }
        return str;
    }

    unescapeCSV(str) {
        if (typeof str !== 'string') return str;
        if (str.startsWith('"') && str.endsWith('"')) {
            return str.slice(1, -1).replace(/""/g, '"');
        }
        return str;
    }

    escapeHtml(str) {
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }
}

class BudgetCalculator {
    constructor() {
        this.chart = null;
        this.trendsChart = null;
        this.selectedCurrency = 'USD';
        
        this.initializeElements();
        this.initializeEventListeners();
        this.createCharts();
        this.setupCurrencySelection();

        // Initialize storage after calculator is ready
        this.storage = new BudgetStorage(this);
    }

    initializeElements() {
        this.incomeInputs = document.getElementById('income-inputs');
        this.addIncomeBtn = document.getElementById('add-income');
        this.expenseInputs = document.getElementById('expense-inputs');
        this.addExpenseBtn = document.getElementById('add-expense');
        this.totalIncomeEl = document.getElementById('total-income');
        this.totalExpensesEl = document.getElementById('total-expenses');
        this.remainingBudgetEl = document.getElementById('remaining-budget');
        this.expenseChart = document.getElementById('expense-chart');
        this.trendsChart = document.getElementById('trends-chart');
        this.currencySelect = document.getElementById('currency-select');
    }

    initializeEventListeners() {
        this.addIncomeBtn.addEventListener('click', () => this.addEntry(this.incomeInputs));
        this.addExpenseBtn.addEventListener('click', () => this.addEntry(this.expenseInputs));
        
        this.currencySelect.addEventListener('change', (e) => {
            this.selectedCurrency = e.target.value;
            this.updateCalculations();
            if (this.storage) this.storage.scheduleAutoSave();
        });
    }

    setupCurrencySelection() {
        const currencies = ['USD', 'EUR', 'GBP', 'JPY', 'AUD', 'CAD', 'CHF', 'CNY', 'INR', 'SAR'];
        this.currencySelect.innerHTML = currencies
            .map(code => `<option value="${code}" ${code === this.selectedCurrency ? 'selected' : ''}>${code}</option>`)
            .join('');
    }

    addEntry(container) {
        const newEntry = document.createElement('div');
        newEntry.className = 'input-group';
        newEntry.innerHTML = `
            <input type="text" class="label-input" placeholder="${container.id === 'income-inputs' ? 'Income Source' : 'Expense Label'}" required>
            <input type="number" class="amount-input" placeholder="Amount" min="0" step="0.01" required>
            <button class="delete-entry">×</button>
        `;
        
        container.appendChild(newEntry);

        const deleteBtn = newEntry.querySelector('.delete-entry');
        const amountInput = newEntry.querySelector('.amount-input');
        const labelInput = newEntry.querySelector('.label-input');

        deleteBtn.addEventListener('click', () => {
            newEntry.remove();
            this.updateCalculations();
            if (this.storage) this.storage.scheduleAutoSave();
        });

        amountInput.addEventListener('input', () => {
            this.updateCalculations();
            if (this.storage) this.storage.scheduleAutoSave();
        });

        labelInput.addEventListener('change', () => {
            if (this.storage) this.storage.scheduleAutoSave();
        });

        labelInput.focus();
    }

    updateCalculations() {
        const totalIncome = this.calculateTotal(this.incomeInputs);
        const totalExpenses = this.calculateTotal(this.expenseInputs);
        const remainingBudget = totalIncome - totalExpenses;

        this.totalIncomeEl.textContent = this.formatCurrency(totalIncome);
        this.totalExpensesEl.textContent = this.formatCurrency(totalExpenses);
        this.remainingBudgetEl.textContent = this.formatCurrency(remainingBudget);
        this.remainingBudgetEl.parentElement.classList.toggle('danger', remainingBudget < 0);

        this.updateCharts();
        this.updateAnalytics(totalIncome, totalExpenses);
    }

    calculateTotal(container) {
        return Array.from(container.querySelectorAll('.amount-input'))
            .reduce((total, input) => {
                const value = parseFloat(input.value) || 0;
                return total + Math.abs(value);
            }, 0);
    }

    formatCurrency(amount) {
        try {
            return new Intl.NumberFormat('en-US', {
                style: 'currency',
                currency: this.selectedCurrency
            }).format(amount);
        } catch (error) {
            console.error('Error formatting currency:', error);
            return `${this.selectedCurrency} ${amount.toFixed(2)}`;
        }
    }

    createCharts() {
        // Expense distribution chart
        const expenseCtx = this.expenseChart.getContext('2d');
        this.chart = new Chart(expenseCtx, {
            type: 'doughnut',
            data: {
                labels: [],
                datasets: [{
                    data: [],
                    backgroundColor: [
                        '#60a5fa', '#34d399', '#fbbf24', '#f87171',
                        '#a78bfa', '#f472b6', '#4ade80', '#fb923c'
                    ]
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        position: 'right',
                        labels: {
                            color: '#f1f5f9',
                            font: { size: 12 }
                        }
                    },
                    tooltip: {
                        callbacks: {
                            label: (context) => {
                                const value = context.raw;
                                const total = context.dataset.data.reduce((a, b) => a + b, 0);
                                const percentage = ((value / total) * 100).toFixed(1);
                                return `${this.formatCurrency(value)} (${percentage}%)`;
                            }
                        }
                    }
                }
            }
        });

        // Trends chart
        const trendsCtx = this.trendsChart.getContext('2d');
        this.trendsChart = new Chart(trendsCtx, {
            type: 'line',
            data: {
                labels: this.getLastSixMonths(),
                datasets: [
                    {
                        label: 'Income',
                        data: [],
                        borderColor: '#34d399',
                        tension: 0.4
                    },
                    {
                        label: 'Expenses',
                        data: [],
                        borderColor: '#f87171',
                        tension: 0.4
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        labels: {
                            color: '#f1f5f9'
                        }
                    },
                    tooltip: {
                        callbacks: {
                            label: (context) => {
                                return `${context.dataset.label}: ${this.formatCurrency(context.raw)}`;
                            }
                        }
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        grid: {
                            color: '#1e293b'
                        },
                        ticks: {
                            color: '#f1f5f9',
                            callback: (value) => this.formatCurrency(value)
                        }
                    },
                    x: {
                        grid: {
                            color: '#1e293b'
                        },
                        ticks: {
                            color: '#f1f5f9'
                        }
                    }
                }
            }
        });
    }

    updateCharts() {
        const expenses = Array.from(this.expenseInputs.querySelectorAll('.input-group'))
            .map(group => ({
                label: group.querySelector('.label-input').value.trim(),
                amount: parseFloat(group.querySelector('.amount-input').value) || 0
            }))
            .filter(expense => expense.label && expense.amount > 0);

        // Update expense distribution chart
        this.chart.data.labels = expenses.map(expense => expense.label);
        this.chart.data.datasets[0].data = expenses.map(expense => expense.amount);
        this.chart.update();

        // Update trends chart
        const totalIncome = this.calculateTotal(this.incomeInputs);
        const totalExpenses = this.calculateTotal(this.expenseInputs);

        const months = this.getLastSixMonths();
        const incomeData = months.map(() => this.generateTrendValue(totalIncome));
        const expenseData = months.map(() => this.generateTrendValue(totalExpenses));

        this.trendsChart.data.labels = months;
        this.trendsChart.data.datasets[0].data = incomeData;
        this.trendsChart.data.datasets[1].data = expenseData;
        this.trendsChart.update();
    }

    updateAnalytics(totalIncome, totalExpenses) {
        const alertsContainer = document.getElementById('alerts-container');
        if (!alertsContainer) return;

        const alerts = [];
        const expenseRatio = totalExpenses / totalIncome;

        if (totalExpenses > totalIncome) {
            alerts.push({
                type: 'warning',
                message: '🚨 Your expenses exceed your income!'
            });
        }

        if (expenseRatio > 0.9 && expenseRatio <= 1) {
            alerts.push({
                type: 'warning',
                message: '⚠️ You\'re spending over 90% of your income'
            });
        }

        if (expenseRatio <= 0.7) {
            alerts.push({
                type: 'success',
                message: '💰 Great job! You\'re saving over 30% of your income'
            });
        }

        const expenseCategories = this.analyzeExpenseCategories();
        expenseCategories.forEach(category => {
            if (category.percentage > 30) {
                alerts.push({
                    type: 'info',
                    message: `📊 ${category.label} accounts for ${category.percentage.toFixed(0)}% of expenses`
                });
            }
        });

        alertsContainer.innerHTML = alerts
            .map(alert => `<div class="alert-item ${alert.type}">${alert.message}</div>`)
            .join('');
    }

    analyzeExpenseCategories() {
        const expenses = Array.from(this.expenseInputs.querySelectorAll('.input-group'))
            .map(group => ({
                label: group.querySelector('.label-input').value.trim(),
                amount: parseFloat(group.querySelector('.amount-input').value) || 0
            }))
            .filter(expense => expense.label && expense.amount > 0);

        const totalExpenses = expenses.reduce((sum, expense) => sum + expense.amount, 0);

        return expenses.map(expense => ({
            label: expense.label,
            amount: expense.amount,
            percentage: (expense.amount / totalExpenses) * 100
        }));
    }

    getLastSixMonths() {
        const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        const result = [];
        const now = new Date();

        for (let i = 5; i >= 0; i--) {
            const monthIndex = (now.getMonth() - i + 12) % 12;
            result.push(months[monthIndex]);
        }

        return result;
    }

    generateTrendValue(baseValue) {
        const variation = (Math.random() - 0.5) * 0.1; // ±5% variation
        return baseValue * (1 + variation);
    }
}

// Browser compatibility checks
const browserSupport = {
    localStorage: !!window.localStorage,
    indexedDB: !!window.indexedDB,
    touchEvents: ('ontouchstart' in window)
};

// Fallback data storage
class StorageManager {
    constructor() {
        this.useLocalStorage = browserSupport.localStorage;
    }

    save(key, data) {
        try {
            if (this.useLocalStorage) {
                localStorage.setItem(key, JSON.stringify(data));
            } else {
                // Cookie fallback
                document.cookie = `${key}=${JSON.stringify(data)};max-age=31536000`;
            }
        } catch (error) {
            console.warn('Storage failed, using memory fallback');
            this._memoryStorage = this._memoryStorage || {};
            this._memoryStorage[key] = data;
        }
    }

    load(key) {
        try {
            if (this.useLocalStorage) {
                return JSON.parse(localStorage.getItem(key));
            } else {
                // Cookie fallback
                const match = document.cookie.match(new RegExp(`${key}=([^;]+)`));
                return match ? JSON.parse(match[1]) : null;
            }
        } catch (error) {
            return this._memoryStorage?.[key] || null;
        }
    }
}

// Input handling for both touch and mouse events
function initializeInputHandlers() {
    const buttons = document.querySelectorAll('button');
    buttons.forEach(button => {
        if (browserSupport.touchEvents) {
            button.addEventListener('touchstart', () => button.classList.add('active'));
            button.addEventListener('touchend', () => button.classList.remove('active'));
        }
    });
}

// Chart responsiveness
function initializeResponsiveCharts() {
    const resizeObserver = new ResizeObserver(entries => {
        for (let entry of entries) {
            const chart = entry.target.querySelector('canvas');
            if (chart && chart.chart) {
                chart.chart.resize();
            }
        }
    });

    document.querySelectorAll('.chart-container').forEach(container => {
        resizeObserver.observe(container);
    });
}

// Currency format fallback
function safeCurrencyFormat(amount, currency) {
    try {
        return new Intl.NumberFormat(undefined, {
            style: 'currency',
            currency: currency
        }).format(amount);
    } catch (error) {
        // Basic fallback formatting
        return `${currency} ${amount.toFixed(2)}`;
    }
}

// Replace storage calls in existing code
const storage = new StorageManager();

// Modify existing save/restore functions
function saveData() {
    storage.save('budgetData', budgetData);
    showSaveStatus();
}

function restoreData() {
    const saved = storage.load('budgetData');
    if (saved) {
        // ...existing restore code...
    }
}

// Initialize with compatibility checks
document.addEventListener('DOMContentLoaded', () => {
    // ...existing initialization code...
    initializeInputHandlers();
    initializeResponsiveCharts();
    
    // Check for required features
    if (!browserSupport.localStorage && !browserSupport.indexedDB) {
        showCompatibilityWarning();
    }
});

// Add compatibility warning
function showCompatibilityWarning() {
    const warning = document.createElement('div');
    warning.className = 'compatibility-warning';
    warning.textContent = 'Some features might be limited in your browser. Your data will still be saved for this session.';
    document.body.insertBefore(warning, document.body.firstChild);
}

// Initialize the application
document.addEventListener('DOMContentLoaded', () => {
    new BudgetCalculator();
});