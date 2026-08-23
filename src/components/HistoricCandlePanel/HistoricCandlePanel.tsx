export default function HistoricCandlePanel() {
  return (
    <section className="panel">
      <p className="eyebrow">Исторические свечи</p>
      <h1>Исторические свечи</h1>
      <p>
        Воркер читает задания только из NATS: на каждый subject{" "}
        <code>{"TrB.HistoricCandle.Task.<uid>.<interval>"}</code> в очереди не
        больше одного сообщения. История последних загрузок — в панели
        «История загрузок».
      </p>
    </section>
  );
}
