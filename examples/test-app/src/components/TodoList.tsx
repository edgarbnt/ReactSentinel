import { useState } from 'react';
import { Todo, TodoItem } from './TodoItem';

export function TodoList() {
  const [todos, setTodos] = useState<Todo[]>([
    { id: 1, text: "Learn React", completed: true },
    { id: 2, text: "Build React-Sentinel", completed: false },
    { id: 3, text: "Test the tool", completed: false }
  ]);
  const [inputValue, setInputValue] = useState("");

  const handleAdd = () => {
    if (inputValue.trim()) {
      setTodos([...todos, { id: Date.now(), text: inputValue.trim(), completed: false }]);
      setInputValue("");
    }
  };

  const handleToggle = (id: number) => {
    setTodos(todos.map(t => t.id === id ? { ...t, completed: !t.completed } : t));
  };

  const handleDelete = (id: number) => {
    setTodos(todos.filter(t => t.id !== id));
  };

  return (
    <div style={{ border: '1px solid #ccc', padding: '1rem', borderRadius: '8px', marginTop: '1rem' }}>
      <h3>Todo List (State & Props Demo)</h3>
      <div style={{ marginBottom: '1rem', display: 'flex', gap: '5px' }}>
        <input 
          type="text" 
          value={inputValue} 
          onChange={(e) => setInputValue(e.target.value)} 
          placeholder="New task..."
        />
        <button onClick={handleAdd}>Add</button>
      </div>
      <ul style={{ listStyle: 'none', padding: 0 }}>
        {todos.map(todo => (
          <TodoItem 
            key={todo.id} 
            todo={todo} 
            onToggle={handleToggle} 
            onDelete={handleDelete} 
          />
        ))}
      </ul>
      <div style={{ marginTop: '1rem', fontSize: '0.9em', color: '#666' }}>
        Total: {todos.length} | Completed: {todos.filter(t => t.completed).length}
      </div>
    </div>
  );
}
