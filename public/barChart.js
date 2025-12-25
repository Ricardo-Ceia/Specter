let barChart;

function formatTime(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return `${h.toString().padStart(2,'0')}:${m.toString().padStart(2,'0')}:${s.toString().padStart(2,'0')}`;
}

function initChart(){
  const ctx = document.getElementById('barChart').getContext('2d');
  barChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: [],
      datasets: [{
        label: 'Time (seconds)',
        data: [],
        backgroundColor: 'rgba(75,192,192,0.6)'
      }]
    },
    options: {
      plugins: {
        legend: {
          position: 'bottom'
        },
        tooltip: {
          callbacks: {
            label: (ctx) => formatTime(ctx.parsed.x)
          }
        }
      },
      scales: {
        x: {
          title: {
            display: true,
            text: 'Seconds'
          },
          ticks: {
            callback: (value) => formatTime(value)  // Format x-axis labels
          }
        }
      },
      responsive: true,
      indexAxis: 'y'
    }
  })
}

function updateChart(data){
  const sorted = Object.entries(data).sort((a,b)=>b[1]-a[1]);

  barChart.data.labels = sorted.map(([terminal])=>terminal);
  barChart.data.datasets[0].data = sorted.map(([,seconds])=>seconds);
  barChart.update();
}
