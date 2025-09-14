import React, { useState, useEffect, useMemo } from 'react';
import { Calculator, Download, FileText, Info } from 'lucide-react';

const KafkaSizingCalculator = () => {
  const [activeTab, setActiveTab] = useState('inputs');

  // Domain structure with subdomains
  const domains = {
    cust: {
      name: 'Customer',
      subdomains: ['marketing', 'customer_engagement_and_personalisation', 'customer_management', 'sales', 'loyalty']
    },
    comm: {
      name: 'Commercial',
      subdomains: ['trading_and_revenue_management', 'network_and_scheduling', 'commercial_partnerships', 'passenger_reservation_and_management', 'product_and_offer_management']
    },
    corp: {
      name: 'Corporate',
      subdomains: ['people', 'facilities', 'finance_and_risk', 'legal_and_compliance']
    },
    aops: {
      name: 'Airline Operations',
      subdomains: ['airport_operations', 'engineering_and_safety', 'scheduling_and_crew_rostering', 'aircraft_and_crew_management', 'flight_operations']
    },
    hols: {
      name: 'easyJet Holidays',
      subdomains: ['search_compare', 'itinerary', 'scheduling', 'payment', 'availability', 'booking', 'notification', 'support']
    }
  };

  const environments = ['dev', 'tst', 'pre', 'prd'];

  // Initial state for domain inputs
  const [domainInputs, setDomainInputs] = useState(() => {
    const initial = {};
    Object.keys(domains).forEach(domain => {
      initial[domain] = {
        messagesPerSec: 100,
        messageSizeKB: 1,
        retentionDays: 7,
        replicationFactor: 3,
        partitions: 6,
        peakMultiplier: 2,
        compressionRatio: 0.7,
        enabled: true
      };
    });
    return initial;
  });

  // Environment scaling factors
  const [envScaling, setEnvScaling] = useState({
    dev: 0.1,
    tst: 0.3,
    pre: 0.7,
    prd: 1.0
  });

  // Cluster architecture choice
  const [clusterArchitecture, setClusterArchitecture] = useState('single'); // 'single' or 'per-domain'

  // Connectors
  const [connectors, setConnectors] = useState(Array(8).fill().map((_, i) => ({
    id: i,
    name: `Connector ${i + 1}`,
    enabled: false,
    monthlyCost: 100
  })));

  // Confluent Cloud ECKU pricing (GBP per ECKU per hour)
  const eckuPricing = {
    basic: 0.12,
    standard: 0.18,
    dedicated: 0.25
  };

  // Calculate ECKU requirements
  const calculateECKU = (domain, env) => {
    const input = domainInputs[domain];
    const scalingFactor = envScaling[env];

    const effectiveMessages = input.messagesPerSec * scalingFactor * input.peakMultiplier;
    const effectiveSize = input.messageSizeKB * input.compressionRatio;

    // Throughput in MB/s
    const throughputMBps = (effectiveMessages * effectiveSize) / 1024;

    // Storage in GB (with replication)
    const storageGB = (effectiveMessages * effectiveSize * input.retentionDays * 86400 * input.replicationFactor) / (1024 * 1024);

    // ECKU calculation (simplified formula)
    // 1 ECKU handles ~10 MB/s throughput and ~100GB storage
    const throughputECKU = Math.ceil(throughputMBps / 10);
    const storageECKU = Math.ceil(storageGB / 100);
    const partitionECKU = Math.ceil(input.partitions / 1000); // 1000 partitions per ECKU

    return Math.max(throughputECKU, storageECKU, partitionECKU, 1); // Minimum 1 ECKU
  };

  // Calculate total sizing
  const sizing = useMemo(() => {
    const results = {};

    environments.forEach(env => {
      results[env] = {};
      Object.keys(domains).forEach(domain => {
        if (domainInputs[domain].enabled) {
          results[env][domain] = {
            ecku: calculateECKU(domain, env),
            throughputMBps: (domainInputs[domain].messagesPerSec * envScaling[env] * domainInputs[domain].peakMultiplier * domainInputs[domain].messageSizeKB * domainInputs[domain].compressionRatio) / 1024,
            storageGB: (domainInputs[domain].messagesPerSec * envScaling[env] * domainInputs[domain].peakMultiplier * domainInputs[domain].messageSizeKB * domainInputs[domain].compressionRatio * domainInputs[domain].retentionDays * 86400 * domainInputs[domain].replicationFactor) / (1024 * 1024)
          };
        }
      });
    });

    return results;
  }, [domainInputs, envScaling]);

  // Calculate costs
  const costs = useMemo(() => {
    const results = {};

    environments.forEach(env => {
      results[env] = {};

      if (clusterArchitecture === 'single') {
        // Single cluster: sum all ECKUs
        const totalECKU = Object.keys(domains).reduce((sum, domain) => {
          return domainInputs[domain].enabled ? sum + (sizing[env][domain]?.ecku || 0) : sum;
        }, 0);

        results[env].clusters = [{
          name: 'Unified Cluster',
          ecku: totalECKU,
          monthlyCostBasic: totalECKU * eckuPricing.basic * 24 * 30,
          monthlyCostStandard: totalECKU * eckuPricing.standard * 24 * 30,
          monthlyCostDedicated: totalECKU * eckuPricing.dedicated * 24 * 30
        }];

      } else {
        // Per-domain clusters
        results[env].clusters = [];
        Object.keys(domains).forEach(domain => {
          if (domainInputs[domain].enabled && sizing[env][domain]) {
            const ecku = sizing[env][domain].ecku;
            results[env].clusters.push({
              name: `${domains[domain].name} Cluster`,
              domain,
              ecku,
              monthlyCostBasic: ecku * eckuPricing.basic * 24 * 30,
              monthlyCostStandard: ecku * eckuPricing.standard * 24 * 30,
              monthlyCostDedicated: ecku * eckuPricing.dedicated * 24 * 30
            });
          }
        });
      }
    });

    return results;
  }, [sizing, clusterArchitecture, domainInputs]);

  // Calculate connector costs
  const connectorCosts = useMemo(() => {
    return connectors.filter(c => c.enabled).reduce((sum, c) => sum + c.monthlyCost, 0);
  }, [connectors]);

  // Export to CSV
  const exportToCSV = () => {
    const csvData = [];
    csvData.push(['Environment', 'Domain/Cluster', 'ECKU', 'Monthly Cost (Basic)', 'Monthly Cost (Standard)', 'Monthly Cost (Dedicated)']);

    environments.forEach(env => {
      costs[env].clusters.forEach(cluster => {
        csvData.push([
          env.toUpperCase(),
          cluster.name,
          cluster.ecku,
          `£${cluster.monthlyCostBasic.toFixed(2)}`,
          `£${cluster.monthlyCostStandard.toFixed(2)}`,
          `£${cluster.monthlyCostDedicated.toFixed(2)}`
        ]);
      });
    });

    const csvContent = csvData.map(row => row.join(',')).join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'kafka-sizing-calculator.csv';
    link.click();
  };

  return (
    <div className="min-h-screen bg-gray-50 p-4">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="bg-white rounded-lg shadow-sm mb-6 p-6">
          <div className="flex items-center gap-3 mb-2">
            <Calculator className="w-8 h-8 text-blue-600" />
            <h1 className="text-3xl font-bold text-gray-900">Confluent Cloud Kafka Sizing Calculator</h1>
          </div>
          <p className="text-gray-600">Plan your Kafka infrastructure across domains and environments with ECKU-based capacity planning</p>
        </div>

        {/* Tab Navigation */}
        <div className="bg-white rounded-lg shadow-sm mb-6">
          <div className="border-b border-gray-200">
            <nav className="flex space-x-8 px-6">
              {[
                { id: 'inputs', name: 'Domain Inputs' },
                { id: 'sizing', name: 'Sizing Results' },
                { id: 'costs', name: 'Cost Summary' }
              ].map(tab => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`py-4 px-1 border-b-2 font-medium text-sm ${activeTab === tab.id
                      ? 'border-blue-500 text-blue-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                    }`}
                >
                  {tab.name}
                </button>
              ))}
            </nav>
          </div>

          {/* Tab Content */}
          <div className="p-6">
            {activeTab === 'inputs' && (
              <div className="space-y-8">
                {/* Architecture Selection */}
                <div className="bg-blue-50 p-4 rounded-lg">
                  <h3 className="font-semibold text-lg mb-3">Cluster Architecture</h3>
                  <div className="space-y-2">
                    <label className="flex items-center">
                      <input
                        type="radio"
                        name="architecture"
                        value="single"
                        checked={clusterArchitecture === 'single'}
                        onChange={(e) => setClusterArchitecture(e.target.value)}
                        className="mr-2"
                      />
                      Single Cluster (all domains share one cluster per environment)
                    </label>
                    <label className="flex items-center">
                      <input
                        type="radio"
                        name="architecture"
                        value="per-domain"
                        checked={clusterArchitecture === 'per-domain'}
                        onChange={(e) => setClusterArchitecture(e.target.value)}
                        className="mr-2"
                      />
                      Cluster per Domain (separate cluster for each domain)
                    </label>
                  </div>
                </div>

                {/* Environment Scaling Factors */}
                <div className="bg-green-50 p-4 rounded-lg">
                  <h3 className="font-semibold text-lg mb-3">Environment Scaling Factors</h3>
                  <div className="grid grid-cols-4 gap-4">
                    {environments.map(env => (
                      <div key={env}>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          {env.toUpperCase()}
                        </label>
                        <input
                          type="number"
                          step="0.1"
                          min="0.1"
                          max="2"
                          value={envScaling[env]}
                          onChange={(e) => setEnvScaling(prev => ({
                            ...prev,
                            [env]: parseFloat(e.target.value) || 0.1
                          }))}
                          className="w-full px-3 py-2 border border-gray-300 rounded-md"
                        />
                      </div>
                    ))}
                  </div>
                </div>

                {/* Domain Inputs */}
                {Object.entries(domains).map(([domainKey, domain]) => (
                  <div key={domainKey} className="border border-gray-200 rounded-lg p-4">
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="text-lg font-semibold text-gray-900">{domain.name} Domain</h3>
                      <label className="flex items-center">
                        <input
                          type="checkbox"
                          checked={domainInputs[domainKey].enabled}
                          onChange={(e) => setDomainInputs(prev => ({
                            ...prev,
                            [domainKey]: { ...prev[domainKey], enabled: e.target.checked }
                          }))}
                          className="mr-2"
                        />
                        Enabled
                      </label>
                    </div>

                    <div className="mb-3">
                      <p className="text-sm text-gray-600">
                        <strong>Subdomains:</strong> {domain.subdomains.join(', ')}
                      </p>
                      <p className="text-sm text-gray-500 mt-1">
                        Topics will follow naming convention: {domainKey}.{'{subdomain}'}.{'{type}'}.{'{version}'}
                      </p>
                    </div>

                    {domainInputs[domainKey].enabled && (
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">
                            Messages/sec
                          </label>
                          <input
                            type="number"
                            min="1"
                            value={domainInputs[domainKey].messagesPerSec}
                            onChange={(e) => setDomainInputs(prev => ({
                              ...prev,
                              [domainKey]: { ...prev[domainKey], messagesPerSec: parseInt(e.target.value) || 1 }
                            }))}
                            className="w-full px-3 py-2 border border-gray-300 rounded-md"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">
                            Message Size (KB)
                          </label>
                          <input
                            type="number"
                            min="0.1"
                            step="0.1"
                            value={domainInputs[domainKey].messageSizeKB}
                            onChange={(e) => setDomainInputs(prev => ({
                              ...prev,
                              [domainKey]: { ...prev[domainKey], messageSizeKB: parseFloat(e.target.value) || 0.1 }
                            }))}
                            className="w-full px-3 py-2 border border-gray-300 rounded-md"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">
                            Retention (Days)
                          </label>
                          <input
                            type="number"
                            min="1"
                            value={domainInputs[domainKey].retentionDays}
                            onChange={(e) => setDomainInputs(prev => ({
                              ...prev,
                              [domainKey]: { ...prev[domainKey], retentionDays: parseInt(e.target.value) || 1 }
                            }))}
                            className="w-full px-3 py-2 border border-gray-300 rounded-md"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">
                            Replication Factor
                          </label>
                          <select
                            value={domainInputs[domainKey].replicationFactor}
                            onChange={(e) => setDomainInputs(prev => ({
                              ...prev,
                              [domainKey]: { ...prev[domainKey], replicationFactor: parseInt(e.target.value) }
                            }))}
                            className="w-full px-3 py-2 border border-gray-300 rounded-md"
                          >
                            <option value={1}>1</option>
                            <option value={3}>3</option>
                            <option value={5}>5</option>
                          </select>
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">
                            Partitions
                          </label>
                          <input
                            type="number"
                            min="1"
                            value={domainInputs[domainKey].partitions}
                            onChange={(e) => setDomainInputs(prev => ({
                              ...prev,
                              [domainKey]: { ...prev[domainKey], partitions: parseInt(e.target.value) || 1 }
                            }))}
                            className="w-full px-3 py-2 border border-gray-300 rounded-md"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">
                            Peak Multiplier
                          </label>
                          <input
                            type="number"
                            min="1"
                            step="0.1"
                            value={domainInputs[domainKey].peakMultiplier}
                            onChange={(e) => setDomainInputs(prev => ({
                              ...prev,
                              [domainKey]: { ...prev[domainKey], peakMultiplier: parseFloat(e.target.value) || 1 }
                            }))}
                            className="w-full px-3 py-2 border border-gray-300 rounded-md"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">
                            Compression Ratio
                          </label>
                          <input
                            type="number"
                            min="0.1"
                            max="1"
                            step="0.1"
                            value={domainInputs[domainKey].compressionRatio}
                            onChange={(e) => setDomainInputs(prev => ({
                              ...prev,
                              [domainKey]: { ...prev[domainKey], compressionRatio: parseFloat(e.target.value) || 0.7 }
                            }))}
                            className="w-full px-3 py-2 border border-gray-300 rounded-md"
                          />
                        </div>
                      </div>
                    )}
                  </div>
                ))}

                {/* Connectors */}
                <div className="border border-gray-200 rounded-lg p-4">
                  <h3 className="text-lg font-semibold text-gray-900 mb-4">Confluent Cloud Connectors (Optional)</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {connectors.map((connector, index) => (
                      <div key={connector.id} className="flex items-center space-x-3">
                        <input
                          type="checkbox"
                          checked={connector.enabled}
                          onChange={(e) => {
                            const updated = [...connectors];
                            updated[index].enabled = e.target.checked;
                            setConnectors(updated);
                          }}
                        />
                        <input
                          type="text"
                          value={connector.name}
                          onChange={(e) => {
                            const updated = [...connectors];
                            updated[index].name = e.target.value;
                            setConnectors(updated);
                          }}
                          className="flex-1 px-3 py-2 border border-gray-300 rounded-md"
                          placeholder="Connector name"
                        />
                        <div className="flex items-center">
                          <span className="text-sm text-gray-600 mr-2">£</span>
                          <input
                            type="number"
                            min="0"
                            value={connector.monthlyCost}
                            onChange={(e) => {
                              const updated = [...connectors];
                              updated[index].monthlyCost = parseFloat(e.target.value) || 0;
                              setConnectors(updated);
                            }}
                            className="w-20 px-2 py-2 border border-gray-300 rounded-md text-sm"
                          />
                          <span className="text-sm text-gray-600 ml-1">/mo</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'sizing' && (
              <div className="space-y-6">
                <div className="flex justify-between items-center">
                  <h2 className="text-2xl font-bold text-gray-900">Sizing Results</h2>
                  <button
                    onClick={exportToCSV}
                    className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                  >
                    <Download className="w-4 h-4" />
                    Export CSV
                  </button>
                </div>

                {environments.map(env => (
                  <div key={env} className="border border-gray-200 rounded-lg p-4">
                    <h3 className="text-lg font-semibold text-gray-900 mb-4">
                      {env.toUpperCase()} Environment (Scaling: {envScaling[env]}x)
                    </h3>
                    <div className="overflow-x-auto">
                      <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-gray-50">
                          <tr>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                              Domain
                            </th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                              ECKU Required
                            </th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                              Throughput (MB/s)
                            </th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                              Storage (GB)
                            </th>
                          </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                          {Object.entries(sizing[env] || {}).map(([domain, data]) => (
                            <tr key={domain}>
                              <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                                {domains[domain].name}
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                                {data.ecku}
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                                {data.throughputMBps.toFixed(2)}
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                                {data.storageGB.toFixed(0)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {activeTab === 'costs' && (
              <div className="space-y-6">
                <div className="flex justify-between items-center">
                  <h2 className="text-2xl font-bold text-gray-900">Cost Summary</h2>
                  <div className="text-sm text-gray-600">
                    Architecture: <span className="font-medium">
                      {clusterArchitecture === 'single' ? 'Single Cluster' : 'Cluster per Domain'}
                    </span>
                  </div>
                </div>

                {environments.map(env => (
                  <div key={env} className="border border-gray-200 rounded-lg p-4">
                    <h3 className="text-lg font-semibold text-gray-900 mb-4">
                      {env.toUpperCase()} Environment
                    </h3>
                    <div className="overflow-x-auto">
                      <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-gray-50">
                          <tr>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                              Cluster
                            </th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                              ECKU
                            </th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                              Basic (£/mo)
                            </th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                              Standard (£/mo)
                            </th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                              Dedicated (£/mo)
                            </th>
                          </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                          {costs[env]?.clusters.map((cluster, index) => (
                            <tr key={index}>
                              <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                                {cluster.name}
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                                {cluster.ecku}
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                                £{cluster.monthlyCostBasic.toFixed(2)}
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                                £{cluster.monthlyCostStandard.toFixed(2)}
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                                £{cluster.monthlyCostDedicated.toFixed(2)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    {/* Environment Totals */}
                    <div className="mt-4 bg-gray-50 p-3 rounded">
                      <div className="text-sm font-medium text-gray-900">Environment Totals:</div>
                      <div className="grid grid-cols-3 gap-4 mt-2 text-sm">
                        <div>Basic: £{costs[env]?.clusters.reduce((sum, c) => sum + c.monthlyCostBasic, 0).toFixed(2)}</div>
                        <div>Standard: £{costs[env]?.clusters.reduce((sum, c) => sum + c.monthlyCostStandard, 0).toFixed(2)}</div>
                        <div>Dedicated: £{costs[env]?.clusters.reduce((sum, c) => sum + c.monthlyCostDedicated, 0).toFixed(2)}</div>
                      </div>
                    </div>
                  </div>
                ))}

                {/* Connector Costs */}
                {connectorCosts > 0 && (
                  <div className="border border-gray-200 rounded-lg p-4">
                    <h3 className="text-lg font-semibold text-gray-900 mb-4">Connector Costs</h3>
                    <div className="space-y-2">
                      {connectors.filter(c => c.enabled).map((connector) => (
                        <div key={connector.id} className="flex justify-between text-sm">
                          <span>{connector.name}</span>
                          <span>£{connector.monthlyCost.toFixed(2)}/mo</span>
                        </div>
                      ))}
                      <div className="border-t pt-2 flex justify-between font-medium">
                        <span>Total Connectors</span>
                        <span>£{connectorCosts.toFixed(2)}/mo</span>
                      </div>
                    </div>
                  </div>
                )}

                {/* Grand Totals */}
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                  <h3 className="text-lg font-semibold text-gray-900 mb-4">Grand Totals (All Environments + Connectors)</h3>
                  <div className="grid grid-cols-3 gap-4">
                    {['Basic', 'Standard', 'Dedicated'].map(tier => {
                      const tierKey = tier.toLowerCase();
                      const total = environments.reduce((sum, env) => {
                        return sum + (costs[env]?.clusters.reduce((envSum, c) => envSum + c[`monthlyCost${tier}`], 0) || 0);
                      }, 0) + connectorCosts;

                      return (
                        <div key={tier} className="bg-white p-4 rounded border">
                          <div className="text-lg font-semibold text-gray-900">{tier}</div>
                          <div className="text-2xl font-bold text-blue-600">£{total.toFixed(2)}/mo</div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Best Practices */}
                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                  <h3 className="text-lg font-semibold text-gray-900 mb-3 flex items-center gap-2">
                    <Info className="w-5 h-5" />
                    Best Practices & Recommendations
                  </h3>
                  <div className="space-y-2 text-sm text-gray-700">
                    <p>• <strong>Environment Sizing:</strong> Start with lower scaling factors for dev/test environments and adjust based on actual usage patterns.</p>
                    <p>• <strong>Retention:</strong> Consider your compliance and analytical requirements when setting retention periods. Longer retention increases storage costs.</p>
                    <p>• <strong>Partitioning:</strong> Plan for future scaling by choosing appropriate partition counts. More partitions enable higher parallelism but increase overhead.</p>
                    <p>• <strong>Replication:</strong> Use replication factor 3 for production environments to ensure high availability and data durability.</p>
                    <p>• <strong>Compression:</strong> Enable compression to reduce storage and network costs. Typical compression ratios range from 0.3-0.8 depending on data type.</p>
                    <p>• <strong>Peak Planning:</strong> Consider seasonal patterns and marketing campaigns when setting peak multipliers.</p>
                    <p>• <strong>Topic Naming:</strong> Follow the convention domain.subdomain.type.version for better organization and governance.</p>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default KafkaSizingCalculator;