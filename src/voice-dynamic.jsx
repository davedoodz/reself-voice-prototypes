import { createRoot } from 'react-dom/client';
import { VoiceRecorder } from './recorder.jsx';

createRoot(document.getElementById('root')).render(<VoiceRecorder variant="dynamic" />);
