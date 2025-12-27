const eventSource = new EventSource('/events');
eventSource.onmessage = (event) => {
  const data = JSON.parse(event.data);
  if(!barChart) initChart();
  updateChart(data);
};

function fetchHistory() {
  fetch('/api/history')
    .then(response => response.json())
    .then(data => {
      if(!thirtydayChart) init30dayChart();
      for (const entry of data) {
        update30dayChart(entry);
      }
    });
}

setTimeout(fetchHistory, 36000);
