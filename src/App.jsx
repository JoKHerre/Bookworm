import { useEffect, useState } from "react";
import Header from "./components/Header";
import "./App.css";

function App() {
  const [message, setMessage] = useState("");

  useEffect(() => {
    fetch("http://localhost:5000/")
      .then((response) => response.json())
      .then((data) => {
        setMessage(data.message);
      })
      .catch((error) => {
        console.error("Error:", error);
      });
  }, []);

  return (
    <>
    <Header></Header>
    <div>
      <h1>Bookworm</h1>
      <p>{message}</p>
    </div>
    </>
  );
}

export default App;