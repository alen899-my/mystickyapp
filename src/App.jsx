import NotePage from "./pages/NotePage";
import NotesProvider from "./context/NotesContext";
function App() {
  return (
    <div id="app">
      <NotesProvider>
        <NotePage />
      </NotesProvider>
    </div>
  );
}

export default App;
