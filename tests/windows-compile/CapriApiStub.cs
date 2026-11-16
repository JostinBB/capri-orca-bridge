// Compilation fixture only. Not the real CapriDesktop assembly.
// API signatures are minimized from CapriDesktop app/ModApi.cs.
using System;
using System.Windows.Forms;
namespace CapriDesktop
{
    public interface ICapriMod
    {
        void Start(ICapriHost capri);
        bool Heard(string words);
        void Stop();
    }
    public interface ICapriHost
    {
        ICapriUi Ui { get; }
        ICapriChat Chat { get; }
        ICapriStore Store { get; }
        ICapriBrain Brain { get; }
        ICapriTimers Timers { get; }
        void Say(string text);
        void Log(string text);
    }
    public interface ICapriUi
    {
        Form Window { get; }
        void AddMenuItem(string name,Action click);
    }
    public sealed class CapriMessage
    {
        public string Text;
        public string Source;
        public bool Cancel;
    }
    public interface ICapriChat
    {
        event Action<CapriMessage> Sending;
    }
    public interface ICapriBrain
    {
        bool AddTool(string name,string description,string takes,Func<string,string> run);
    }
    public interface ICapriStore
    {
        string Get(string key,string fallback);
        bool Flag(string key,bool fallback);
        void Set(string key,bool value);
        void Set(string key,string value);
    }
    public interface ICapriTimers
    {
        ICapriTimer Every(double seconds,Action action);
    }
    public interface ICapriTimer
    {
        void Cancel();
    }
}
