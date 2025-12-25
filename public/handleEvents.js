const eventSource = new EventSource('/events');
eventSource.onmessage = (event) => {
  const data = JSON.parse(event.data);
  if(!barChart) initChart();
  updateChart(data);
};
