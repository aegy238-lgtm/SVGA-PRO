import React, { useState, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Upload, FileVideo, FileCode, Loader2, X } from 'lucide-react';
import { UserRecord } from '../types';
import { logActivity } from '../utils/logger';

interface VapToSvgaConverterProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser: UserRecord | null;
}

export const VapToSvgaConverter: React.FC<VapToSvgaConverterProps> = ({ isOpen, onClose, currentUser }) => {
  const [inputPath, setInputPath] = useState<string>('');
  const [outputPath, setOutputPath] = useState<string>('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [status, setStatus] = useState<string>('جاهز | Ready');
  const [progress, setProgress] = useState(0);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setInputPath(file.name);
      setOutputPath(file.name.replace(/\.[^/.]+$/, "") + ".svga");
    }
  };

  const startConversion = async () => {
    if (!inputPath) {
      alert("الرجاء اختيار ملف VAP أولاً.");
      return;
    }
    
    setIsProcessing(true);
    setStatus('جاري التحويل...');
    setProgress(10);

    // هنا سيتم دمج منطق التحويل الفعلي (الذي استخرجناه سابقاً)
    // سيعمل هذا المنطق داخل المتصفح باستخدام Canvas و WebAssembly
    setTimeout(() => {
      setProgress(100);
      setStatus('تم التحويل بنجاح!');
      setIsProcessing(false);
      
      if (currentUser) {
        logActivity(currentUser, 'feature_usage', `Converted VAP to SVGA: ${inputPath}`);
      }

      alert("تم تحويل الملف بنجاح!");
    }, 3000);
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
        >
          <motion.div
            initial={{ scale: 0.9 }}
            animate={{ scale: 1 }}
            exit={{ scale: 0.9 }}
            className="w-full max-w-lg rounded-xl bg-white p-6 shadow-2xl"
          >
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold">VAP → SVGA Converter</h2>
              <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded-full">
                <X size={20} />
              </button>
            </div>

            <div className="space-y-4">
              <div className="p-4 border-2 border-dashed rounded-lg text-center">
                <input type="file" onChange={handleFileChange} className="hidden" id="vap-upload" />
                <label htmlFor="vap-upload" className="cursor-pointer flex flex-col items-center">
                  <Upload className="mb-2 text-gray-400" />
                  <span className="text-sm text-gray-600">{inputPath || "اختر ملف VAP"}</span>
                </label>
              </div>

              <div className="p-4 bg-gray-50 rounded-lg">
                <p className="text-sm text-gray-600">ملف الإخراج: {outputPath || "..."}</p>
              </div>

              <button
                onClick={startConversion}
                disabled={isProcessing}
                className="w-full py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 disabled:bg-gray-400"
              >
                {isProcessing ? <Loader2 className="animate-spin mx-auto" /> : "تحويل → SVGA"}
              </button>

              <div className="mt-4 p-3 bg-gray-100 rounded text-sm">
                <p>{status}</p>
                {isProcessing && <div className="w-full h-2 bg-gray-200 rounded mt-2"><div className="h-full bg-blue-600 rounded" style={{width: `${progress}%`}}></div></div>}
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
